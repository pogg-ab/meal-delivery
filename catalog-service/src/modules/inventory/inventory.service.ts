
import { Injectable, Logger, NotFoundException, ForbiddenException, Inject } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource } from 'typeorm';
import { Inventory } from '../../entities/inventory.entity';
import { InventoryLog, InventoryChangeType } from '../../entities/inventory-log.entity';
import { MenuItem } from '../../entities/menu-item.entity';
import { MenuCategory } from '../../entities/menu-category.entity';
import { Restaurant } from '../../entities/restaurant.entity';
import { ReplenishItemDto } from './dto/replenish-item.dto';
import { Cron, CronExpression } from '@nestjs/schedule';
import { KafkaProvider } from 'src/providers/kafka.provider';

// Order deduction payload
interface OrderItemPayload {
  menuItemId: string;
  quantity: number;
}

@Injectable()
export class InventoryService {
  private readonly logger = new Logger(InventoryService.name);

  constructor(
    private readonly dataSource: DataSource,
    @InjectRepository(Inventory) private readonly inventoryRepository: Repository<Inventory>,
    @InjectRepository(MenuItem) private readonly menuItemRepository: Repository<MenuItem>,
    @InjectRepository(MenuCategory) private readonly categoryRepository: Repository<MenuCategory>,
    @InjectRepository(Restaurant) private readonly restaurantRepository: Repository<Restaurant>,
    @InjectRepository(InventoryLog) private readonly inventoryLogRepository: Repository<InventoryLog>,
    private readonly kafkaClient: KafkaProvider,
  ) {}

  // ---------- Cron: sync availability ----------
  @Cron(CronExpression.EVERY_5_MINUTES)
  async handleCron() {
    this.logger.log('Running scheduled job to sync inventory and menu availability...');
    await this.syncAvailability();
  }

  @Cron(CronExpression.EVERY_10_MINUTES)
  async handleLowStockCheck() {
    this.logger.log('Running scheduled job to check for low-stock items...');

    const lowStockItems = await this.inventoryRepository
      .createQueryBuilder('inventory')
      .leftJoinAndSelect('inventory.menu_item', 'menuItem')
      .leftJoinAndSelect('inventory.restaurant', 'restaurant') // <-- JOIN restaurant to get owner_id
      .where('inventory.stock_quantity <= inventory.reorder_level')
      // Optional but recommended: Add a flag to avoid spamming notifications
      // .andWhere('inventory.low_stock_notified = false') 
      .getMany();

    if (lowStockItems.length === 0) {
      this.logger.log('No low-stock items found.');
      return;
    }

    this.logger.log(`Found ${lowStockItems.length} low-stock items. Emitting events...`);

    for (const item of lowStockItems) {
      const payload = {
        menuItemId: item.menu_item_id,
        itemName: item.menu_item.name, // We have the name from the join
        restaurantId: item.restaurant_id,
        ownerId: item.restaurant.owner_id, // <-- CRITICAL: Add ownerId to payload
        remainingStock: item.stock_quantity,
        reorderLevel: item.reorder_level,
      };

      await this.kafkaClient.emit('inventory.low_stock', payload);

      // Optional: Update the flag to prevent re-notifying
      // await this.inventoryRepository.update(item.id, { low_stock_notified: true });
    }
  }



  async syncAvailability(): Promise<{ madeAvailable: number; madeUnavailable: number }> {
    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();

    try {
      const itemsToMakeAvailable = await queryRunner.manager
        .createQueryBuilder(MenuItem, 'menuItem')
        .innerJoin('inventory', 'inv', 'inv.menu_item_id = menuItem.id')
        .where('menuItem.is_available = :isAvailable', { isAvailable: false })
        .andWhere('inv.stock_quantity > 0')
        .getMany();

      if (itemsToMakeAvailable.length > 0) {
        const ids = itemsToMakeAvailable.map(i => i.id);
        await queryRunner.manager.update(MenuItem, ids, { is_available: true });
        this.logger.log(`Scheduled sync: Made ${ids.length} item(s) available.`);
      }

      const itemsToMakeUnavailable = await queryRunner.manager
        .createQueryBuilder(MenuItem, 'menuItem')
        .innerJoin('inventory', 'inv', 'inv.menu_item_id = menuItem.id')
        .where('menuItem.is_available = :isAvailable', { isAvailable: true })
        .andWhere('inv.stock_quantity <= 0')
        .getMany();

      if (itemsToMakeUnavailable.length > 0) {
        const ids = itemsToMakeUnavailable.map(i => i.id);
        await queryRunner.manager.update(MenuItem, ids, { is_available: false });
        this.logger.log(`Scheduled sync: Made ${ids.length} item(s) unavailable.`);
      }

      return { madeAvailable: itemsToMakeAvailable.length, madeUnavailable: itemsToMakeUnavailable.length };
    } catch (err) {
      this.logger.error('Error during scheduled inventory sync:', err.stack || err);
      return { madeAvailable: 0, madeUnavailable: 0 };
    } finally {
      await queryRunner.release();
    }
  }

  // ---------- Deduct stock for an order (internal) ----------
  async deductStockForOrder(items: OrderItemPayload[]): Promise<void> {
    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      for (const item of items) {
        const inventory = await queryRunner.manager.findOne(Inventory, {
          where: { menu_item_id: item.menuItemId },
          lock: { mode: 'pessimistic_write' },
        });

        if (!inventory) {
          throw new NotFoundException(`Inventory for menu item ${item.menuItemId} not found.`);
        }

        if (inventory.stock_quantity < item.quantity) {
          throw new Error(`Insufficient stock for menu item ${item.menuItemId}.`);
        }

        inventory.stock_quantity -= item.quantity;

        const log = queryRunner.manager.create(InventoryLog, {
          inventory,
          quantity_change: -item.quantity,
          change_type: InventoryChangeType.ORDER_DEDUCTION,
        });
        await queryRunner.manager.save(log);

        if (inventory.stock_quantity <= 0) {
          await queryRunner.manager.update(MenuItem, { id: item.menuItemId }, { is_available: false });
        }

        await queryRunner.manager.save(inventory);
      }

      await queryRunner.commitTransaction();
      this.logger.log(`Successfully deducted stock for ${items.length} items.`);
    } catch (err) {
      await queryRunner.rollbackTransaction();
      this.logger.error('Failed to deduct stock for order. Transaction rolled back.', err.stack || err);
      throw err;
    } finally {
      await queryRunner.release();
    }
  }

  // ---------- Get inventory for a restaurant (owner-only) ----------
  async getInventoryForRestaurant(restaurantId: string, userId: string): Promise<Inventory[]> {
    // verify restaurant exists & ownership
    const restaurant = await this.restaurantRepository.findOne({ where: { id: restaurantId } });
    if (!restaurant) {
      throw new NotFoundException(`Restaurant with id ${restaurantId} not found.`);
    }
    if (restaurant.owner_id !== userId) {
      throw new ForbiddenException(`You do not belong to this restaurant (${restaurant.name}).`);
    }

    const inventoryItems = await this.inventoryRepository.find({
      where: { restaurant_id: restaurantId },
      relations: { menu_item: true },
      order: { menu_item: { name: 'ASC' } },
    });

    return inventoryItems || [];
  }

  // ---------- Helper: fetch menuItem -> category -> restaurant ----------
  private async loadMenuItemWithRestaurant(queryRunnerOrManager: any, menuItemId: string): Promise<{ menuItem: MenuItem | null; restaurantId?: string; restaurantName?: string }> {
    // use provided manager (queryRunner.manager) to stay within transaction
    const menuItem = await queryRunnerOrManager.findOne(MenuItem, {
      where: { id: menuItemId },
      relations: ['category', 'category.restaurant'],
    });

    if (!menuItem) return { menuItem: null };

    const restaurant = (menuItem.category && (menuItem.category as any).restaurant) ? (menuItem.category as any).restaurant : null;
    return { menuItem, restaurantId: restaurant?.id, restaurantName: restaurant?.name };
  }

  // ---------- Manual stock update (owner-only; auto-create inventory if missing) ----------
  async updateStockManually(menuItemId: string, newQuantity: number, userId: string): Promise<Inventory> {
    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      // try find existing inventory (may be missing)
      let inventory = await queryRunner.manager.findOne(Inventory, { where: { menu_item_id: menuItemId } });

      if (!inventory) {
        // Need to load menu item -> category -> restaurant to validate ownership and create inventory
        const { menuItem, restaurantId, restaurantName } = await this.loadMenuItemWithRestaurant(queryRunner.manager, menuItemId);

        if (!menuItem) {
          throw new NotFoundException(`Menu item ${menuItemId} not found.`);
        }
        if (!restaurantId) {
          throw new NotFoundException(`Menu item ${menuItemId} has no restaurant associated.`);
        }
        // ownership check
        const restaurant = await this.restaurantRepository.findOne({ where: { id: restaurantId } });
        if (!restaurant) throw new NotFoundException(`Restaurant ${restaurantId} not found.`);
        if (restaurant.owner_id !== userId) {
          throw new ForbiddenException(`You do not belong to this restaurant (${restaurant.name}) while updating menu item ${menuItemId}.`);
        }

        // create inventory row
        inventory = queryRunner.manager.create(Inventory, {
          menu_item_id: menuItemId,
          restaurant_id: restaurantId,
          stock_quantity: 0,
        });
        await queryRunner.manager.save(inventory);
        this.logger.log(`Created inventory row for menu_item_id ${menuItemId}`);
      } else {
        // inventory exists — ensure the restaurant owning this inventory is owned by user
        const inventoryRestaurant = await queryRunner.manager.findOne(Restaurant, { where: { id: inventory.restaurant_id } });
        if (!inventoryRestaurant) throw new NotFoundException(`Restaurant ${inventory.restaurant_id} not found.`);
        if (inventoryRestaurant.owner_id !== userId) {
          throw new ForbiddenException(`You do not belong to this restaurant (${inventoryRestaurant.name}) while updating menu item ${menuItemId}.`);
        }
      }

      // apply update
      const oldQuantity = inventory.stock_quantity;
      const quantityChange = newQuantity - oldQuantity;

      if (quantityChange !== 0) {
        inventory.stock_quantity = newQuantity;

        const log = queryRunner.manager.create(InventoryLog, {
          inventory,
          quantity_change: quantityChange,
          change_type: InventoryChangeType.MANUAL_UPDATE,
          reason: 'Manual stock update by owner.',
        });
        await queryRunner.manager.save(log);

        // update menu availability
        if (oldQuantity <= 0 && newQuantity > 0) {
          await queryRunner.manager.update(MenuItem, { id: menuItemId }, { is_available: true });
        } else if (oldQuantity > 0 && newQuantity <= 0) {
          await queryRunner.manager.update(MenuItem, { id: menuItemId }, { is_available: false });
        }

        await queryRunner.manager.save(inventory);
      }

      await queryRunner.commitTransaction();
      this.logger.log(`Successfully updated stock for menu item ${menuItemId} to ${newQuantity}`);
      return inventory;
    } catch (err) {
      await queryRunner.rollbackTransaction();
      this.logger.error(`Failed to update stock for menu item ${menuItemId}. Transaction rolled back.`, err.stack || err);
      throw err;
    } finally {
      await queryRunner.release();
    }
  }

  // ---------- Replenish (bulk) ----------
  async replenishStock(items: ReplenishItemDto[], userId: string): Promise<{ message: string; count: number }> {
    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      for (const item of items) {
        // find existing inventory
        let inventory = await queryRunner.manager.findOne(Inventory, { where: { menu_item_id: item.menu_item_id } });

        if (!inventory) {
          // load menu item -> category -> restaurant for ownership validation
          const { menuItem, restaurantId, restaurantName } = await this.loadMenuItemWithRestaurant(queryRunner.manager, item.menu_item_id);

          if (!menuItem) {
            throw new NotFoundException(`Menu item ${item.menu_item_id} not found.`);
          }
          if (!restaurantId) {
            throw new NotFoundException(`Menu item ${item.menu_item_id} has no restaurant associated.`);
          }

          const restaurant = await this.restaurantRepository.findOne({ where: { id: restaurantId } });
          if (!restaurant) {
            throw new NotFoundException(`Restaurant ${restaurantId} not found.`);
          }
          if (restaurant.owner_id !== userId) {
            throw new ForbiddenException(`You do not belong to this restaurant (${restaurant.name}) while replenishing menu item ${item.menu_item_id}.`);
          }

          // create inventory row
          inventory = queryRunner.manager.create(Inventory, {
            menu_item_id: item.menu_item_id,
            restaurant_id: restaurantId,
            stock_quantity: 0,
          });
          await queryRunner.manager.save(inventory);
          this.logger.log(`Created inventory row for menu_item_id ${item.menu_item_id}`);
        } else {
          // inventory exists — verify owner of the restaurant attached to inventory
          const inventoryRestaurant = await queryRunner.manager.findOne(Restaurant, { where: { id: inventory.restaurant_id } });
          if (!inventoryRestaurant) throw new NotFoundException(`Restaurant ${inventory.restaurant_id} not found.`);
          if (inventoryRestaurant.owner_id !== userId) {
            throw new ForbiddenException(`You do not belong to this restaurant (${inventoryRestaurant.name}) while replenishing menu item ${item.menu_item_id}.`);
          }
        }

        // apply the update
        const oldQuantity = inventory.stock_quantity;
        const newQuantity = item.stock_quantity;
        const quantityChange = newQuantity - oldQuantity;

        if (quantityChange !== 0) {
          inventory.stock_quantity = newQuantity;

          const log = queryRunner.manager.create(InventoryLog, {
            inventory,
            quantity_change: quantityChange,
            change_type: InventoryChangeType.RESTOCK,
            reason: 'Bulk replenish operation.',
          });
          await queryRunner.manager.save(log);

          if (oldQuantity <= 0 && newQuantity > 0) {
            await queryRunner.manager.update(MenuItem, { id: item.menu_item_id }, { is_available: true });
          }

          await queryRunner.manager.save(inventory);
        }
      }

      await queryRunner.commitTransaction();
      const successMsg = `Successfully replenished stock for ${items.length} item(s).`;
      this.logger.log(successMsg);
      return { message: successMsg, count: items.length };
    } catch (err) {
      await queryRunner.rollbackTransaction();
      this.logger.error(`Failed to replenish stock. Transaction rolled back.`, err.stack || err);
      throw err;
    } finally {
      await queryRunner.release();
    }
  }
  
}

