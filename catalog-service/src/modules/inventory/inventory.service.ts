
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
import { InventoryParLevel } from '../../entities/inventory-par-level.entity';
import { SetParLevelDto } from './dto/set-par-level.dto';

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
    @InjectRepository(InventoryParLevel)
    private readonly parLevelRepository: Repository<InventoryParLevel>,
  ) {}

  // ---------- Cron: sync availability ----------
  @Cron(CronExpression.EVERY_10_MINUTES)
  async handleCron() {
    this.logger.log('Running scheduled job to sync inventory and menu availability...');
    await this.syncAvailability();
  }

  @Cron(CronExpression.EVERY_10_MINUTES)
  async handleLowStockCheck() {
    this.logger.log('Running scheduled job to check for low-stock items...');

    const lowStockItems = await this.inventoryRepository
      .createQueryBuilder('inventory')
      // Use INNER JOIN to automatically filter out inventory for deleted menu items
      .innerJoinAndSelect('inventory.menu_item', 'menuItem')
      .innerJoinAndSelect('inventory.restaurant', 'restaurant')
      .where('inventory.stock_quantity <= inventory.reorder_level')
      .getMany();

    if (lowStockItems.length === 0) {
      this.logger.log('No low-stock items found.');
      return;
    }

    this.logger.log(`Found ${lowStockItems.length} low-stock items. Emitting events...`);

    // This loop is now safe because every item is guaranteed to have a menu_item and restaurant
    for (const item of lowStockItems) {
      const payload = {
        menuItemId: item.menu_item_id,
        itemName: item.menu_item.name,
        restaurantId: item.restaurant_id,
        ownerId: item.restaurant.owner_id,
        remainingStock: item.stock_quantity,
        reorderLevel: item.reorder_level,
      };

      await this.kafkaClient.emit('inventory.low_stock', payload);
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
 async updateStockManually(menuItemId: string, quantityToAdd: number, userId: string): Promise<Inventory> {
    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      // This logic to find/create the inventory item and validate ownership is correct and unchanged.
      let inventory = await queryRunner.manager.findOne(Inventory, { where: { menu_item_id: menuItemId } });

      if (!inventory) {
        const { menuItem, restaurantId } = await this.loadMenuItemWithRestaurant(queryRunner.manager, menuItemId);
        if (!menuItem) { throw new NotFoundException(`Menu item ${menuItemId} not found.`); }
        if (!restaurantId) { throw new NotFoundException(`Menu item ${menuItemId} has no restaurant associated.`); }
        const restaurant = await this.restaurantRepository.findOne({ where: { id: restaurantId } });
        if (!restaurant) throw new NotFoundException(`Restaurant ${restaurantId} not found.`);
        if (restaurant.owner_id !== userId) { throw new ForbiddenException(`You do not belong to this restaurant while updating menu item ${menuItemId}.`); }
        inventory = queryRunner.manager.create(Inventory, {
          menu_item_id: menuItemId, restaurant_id: restaurantId, stock_quantity: 0,
        });
        await queryRunner.manager.save(inventory);
        this.logger.log(`Created inventory row for menu_item_id ${menuItemId}`);
      } else {
        const inventoryRestaurant = await queryRunner.manager.findOne(Restaurant, { where: { id: inventory.restaurant_id } });
        if (!inventoryRestaurant) throw new NotFoundException(`Restaurant ${inventory.restaurant_id} not found.`);
        if (inventoryRestaurant.owner_id !== userId) { throw new ForbiddenException(`You do not belong to this restaurant while updating menu item ${menuItemId}.`); }
      }

      // --- CORE LOGIC CHANGE ---
      // The logic below is corrected to perform an ADD operation.

      const oldQuantity = inventory.stock_quantity;
      
      // Add the incoming quantity to the current stock.
      inventory.stock_quantity += quantityToAdd;

      // The change is the positive number we just added.
      const log = queryRunner.manager.create(InventoryLog, {
        inventory,
        quantity_change: quantityToAdd,
        change_type: InventoryChangeType.MANUAL_UPDATE,
        reason: 'Manual stock addition by owner.',
      });
      await queryRunner.manager.save(log);

      // Update menu availability if it was previously out of stock.
      if (oldQuantity <= 0 && inventory.stock_quantity > 0) {
        await queryRunner.manager.update(MenuItem, { id: menuItemId }, { is_available: true });
      }

      await queryRunner.manager.save(inventory);
      await queryRunner.commitTransaction();
      
      this.logger.log(`Successfully added ${quantityToAdd} stock for menu item ${menuItemId}. New total: ${inventory.stock_quantity}`);
      return inventory;

    } catch (err) {
      await queryRunner.rollbackTransaction();
      this.logger.error(`Failed to update stock for menu item ${menuItemId}. Transaction rolled back.`, err.stack || err);
      throw err;
    } finally {
      await queryRunner.release();
    }
  }

  async replenishStock(items: ReplenishItemDto[], userId: string): Promise<{ message: string; count: number }> {
    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      for (const item of items) {
        // This logic to find/create the inventory item and validate ownership is correct and unchanged.
        let inventory = await queryRunner.manager.findOne(Inventory, { where: { menu_item_id: item.menu_item_id } });
        if (!inventory) {
          const { menuItem, restaurantId } = await this.loadMenuItemWithRestaurant(queryRunner.manager, item.menu_item_id);
          if (!menuItem) { throw new NotFoundException(`Menu item ${item.menu_item_id} not found.`); }
          if (!restaurantId) { throw new NotFoundException(`Menu item ${item.menu_item_id} has no restaurant associated.`); }
          const restaurant = await this.restaurantRepository.findOne({ where: { id: restaurantId } });
          if (!restaurant) { throw new NotFoundException(`Restaurant ${restaurantId} not found.`); }
          if (restaurant.owner_id !== userId) { throw new ForbiddenException(`You do not belong to this restaurant while replenishing menu item ${item.menu_item_id}.`); }
          inventory = queryRunner.manager.create(Inventory, {
            menu_item_id: item.menu_item_id, restaurant_id: restaurantId, stock_quantity: 0,
          });
          await queryRunner.manager.save(inventory);
          this.logger.log(`Created inventory row for menu_item_id ${item.menu_item_id}`);
        } else {
          const inventoryRestaurant = await queryRunner.manager.findOne(Restaurant, { where: { id: inventory.restaurant_id } });
          if (!inventoryRestaurant) throw new NotFoundException(`Restaurant ${inventory.restaurant_id} not found.`);
          if (inventoryRestaurant.owner_id !== userId) { throw new ForbiddenException(`You do not belong to this restaurant while replenishing menu item ${item.menu_item_id}.`); }
        }

        // --- CORE LOGIC CHANGE ---
        // The logic below is corrected to perform an ADD operation.

        const oldQuantity = inventory.stock_quantity;

        // Add the quantity from the DTO to the current stock.
        // We use item.stock_quantity because that's the property name in your DTO.
        inventory.stock_quantity += item.stock_quantity;

        const log = queryRunner.manager.create(InventoryLog, {
          inventory,
          quantity_change: item.stock_quantity,
          change_type: InventoryChangeType.RESTOCK,
          reason: 'Bulk replenish operation.',
        });
        await queryRunner.manager.save(log);

        // Update menu availability if it was previously out of stock.
        if (oldQuantity <= 0 && inventory.stock_quantity > 0) {
          await queryRunner.manager.update(MenuItem, { id: item.menu_item_id }, { is_available: true });
        }

        await queryRunner.manager.save(inventory);
      }

      await queryRunner.commitTransaction();
      const successMsg = `Successfully added stock for ${items.length} item(s).`;
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

  @Cron(CronExpression.EVERY_DAY_AT_3AM) // Runs automatically every day at 3 AM
  async handleDailyStockReset() {
    this.logger.log('Running daily job to reset stock to configured par levels...');
    const parLevels = await this.parLevelRepository.find();

    if (parLevels.length === 0) {
      this.logger.log('No par levels configured. Skipping daily reset.');
      return;
    }
    
    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
        for (const par of parLevels) {
            let inventory = await queryRunner.manager.findOne(Inventory, { where: { menu_item_id: par.menu_item_id } });

            if (!inventory) {
                inventory = queryRunner.manager.create(Inventory, {
                    menu_item_id: par.menu_item_id,
                    restaurant_id: par.restaurant_id,
                    stock_quantity: 0, 
                });
            }
            
            const oldQuantity = inventory.stock_quantity;
            const newQuantity = par.par_level; // This is the target quantity
            const quantityChange = newQuantity - oldQuantity;

            // This logic performs a RESET, not an addition.
            if (quantityChange !== 0) {
                inventory.stock_quantity = newQuantity;

                const log = queryRunner.manager.create(InventoryLog, {
                    inventory,
                    quantity_change: quantityChange,
                    change_type: InventoryChangeType.MANUAL_UPDATE, // Can be logged as MANUAL or a new type
                    reason: `Daily auto-reset to par level of ${newQuantity}.`,
                });
                await queryRunner.manager.save(log);

                if (oldQuantity <= 0 && newQuantity > 0) {
                    await queryRunner.manager.update(MenuItem, { id: par.menu_item_id }, { is_available: true });
                } else if (oldQuantity > 0 && newQuantity <= 0) {
                    await queryRunner.manager.update(MenuItem, { id: par.menu_item_id }, { is_available: false });
                }
                
                await queryRunner.manager.save(inventory);
            }
        }
        await queryRunner.commitTransaction();
        this.logger.log(`Successfully reset stock for ${parLevels.length} item(s) to their par levels.`);
    } catch (err) {
        await queryRunner.rollbackTransaction();
        this.logger.error('Failed during daily stock reset. Transaction rolled back.', err.stack || err);
    } finally {
        await queryRunner.release();
    }
  }
async setParLevel(dto: SetParLevelDto, userId: string): Promise<InventoryParLevel> {
    const { menuItem, restaurantId } = await this.loadMenuItemWithRestaurant(this.dataSource.manager, dto.menu_item_id);
    if (!menuItem) { throw new NotFoundException(`Menu item ${dto.menu_item_id} not found.`); }
    if (!restaurantId) { throw new NotFoundException(`Menu item ${dto.menu_item_id} has no restaurant associated.`); }
    
    await this.validateOwnerAccess(restaurantId, userId);

    let parLevel = await this.parLevelRepository.findOne({ where: { menu_item_id: dto.menu_item_id } });
    
    if (parLevel) {
      // Update existing par level
      parLevel.par_level = dto.par_level;
    } else {
      // Create a new par level
      parLevel = this.parLevelRepository.create({
        menu_item_id: dto.menu_item_id,
        restaurant_id: restaurantId,
        par_level: dto.par_level,
      });
    }
    return this.parLevelRepository.save(parLevel);
  }

  async getParLevelsForRestaurant(restaurantId: string, userId: string): Promise<InventoryParLevel[]> {
    await this.validateOwnerAccess(restaurantId, userId);
    
    return this.parLevelRepository.find({
      where: { restaurant_id: restaurantId },
      relations: ['menu_item'],
      order: { menu_item: { name: 'ASC' } }
    });
  }

  async removeParLevel(menuItemId: string, userId: string): Promise<{ message: string }> {
    const parLevel = await this.parLevelRepository.findOne({ where: { menu_item_id: menuItemId } });
    if (!parLevel) { throw new NotFoundException(`Par level for menu item ${menuItemId} not found.`); }
    
    await this.validateOwnerAccess(parLevel.restaurant_id, userId);

    await this.parLevelRepository.remove(parLevel);
    return { message: 'Daily stock reset level removed successfully.' };
  }

  // --- NEW PRIVATE HELPER FOR OWNERSHIP VALIDATION ---
  private async validateOwnerAccess(restaurantId: string | undefined, userId: string): Promise<void> {
    if (!restaurantId) {
      throw new NotFoundException(`Restaurant id not provided.`);
    }
    const restaurant = await this.restaurantRepository.findOne({ where: { id: restaurantId } });
    if (!restaurant) {
      throw new NotFoundException(`Restaurant with id ${restaurantId} not found.`);
    }
    if (restaurant.owner_id !== userId) {
      throw new ForbiddenException(`You do not belong to this restaurant.`);
    }
  }

   async bulkSetParLevels(
    items: SetParLevelDto[],
    userId: string,
  ): Promise<{ message: string; count: number }> {
    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      for (const item of items) {
        // Step 1: Validate ownership for each item
        const { menuItem, restaurantId } = await this.loadMenuItemWithRestaurant(
          queryRunner.manager,
          item.menu_item_id,
        );
        if (!menuItem) {
          throw new NotFoundException(`Menu item ${item.menu_item_id} not found.`);
        }
        await this.validateOwnerAccess(restaurantId, userId);

        // Step 2: Find existing or create new par level record
        let parLevel = await queryRunner.manager.findOne(InventoryParLevel, {
          where: { menu_item_id: item.menu_item_id },
        });

        if (parLevel) {
          // Update existing
          parLevel.par_level = item.par_level;
        } else {
          // Create new
          parLevel = queryRunner.manager.create(InventoryParLevel, {
            menu_item_id: item.menu_item_id,
            restaurant_id: restaurantId,
            par_level: item.par_level,
          });
        }

        // Step 3: Save the record within the transaction
        await queryRunner.manager.save(parLevel);
      }

      await queryRunner.commitTransaction();

      const successMsg = `Successfully set par levels for ${items.length} item(s).`;
      this.logger.log(successMsg);
      return { message: successMsg, count: items.length };
    } catch (err) {
      await queryRunner.rollbackTransaction();
      this.logger.error('Failed to set par levels in bulk. Transaction rolled back.', err.stack || err);
      throw err; // Re-throw the error to be handled by NestJS
    } finally {
      await queryRunner.release();
    }
  }


}

