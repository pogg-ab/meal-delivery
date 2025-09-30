import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { Inventory } from '../../entities/inventory.entity';
import { InventoryLog, InventoryChangeType } from '../../entities/inventory-log.entity';
import { MenuItem } from '../../entities/menu-item.entity';
import { ReplenishItemDto } from './dto/replenish-item.dto';
import { Cron, CronExpression } from '@nestjs/schedule';

// This interface for the Kafka payload can remain camelCase as it's a DTO contract
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
    @InjectRepository(InventoryLog) private readonly inventoryLogRepository: Repository<InventoryLog>,
  ) {}


  @Cron(CronExpression.EVERY_5_MINUTES) // Runs every 15 minutes
async handleCron() {
  this.logger.log('Running scheduled job to sync inventory and menu availability...');
  await this.syncAvailability();
}

async syncAvailability(): Promise<{ madeAvailable: number; madeUnavailable: number }> {
  const queryRunner = this.dataSource.createQueryRunner();
  await queryRunner.connect();

  try {
    // 1. Find items that ARE unavailable but SHOULD be available (stock > 0)
    const itemsToMakeAvailable = await queryRunner.manager
      .createQueryBuilder(MenuItem, 'menuItem')
      .innerJoin('inventory', 'inv', 'inv.menu_item_id = menuItem.id')
      .where('menuItem.is_available = :isAvailable', { isAvailable: false })
      .andWhere('inv.stock_quantity > 0')
      .getMany();

    if (itemsToMakeAvailable.length > 0) {
      const ids = itemsToMakeAvailable.map((item) => item.id);
      await queryRunner.manager.update(MenuItem, ids, { is_available: true });
      this.logger.log(`Scheduled sync: Made ${ids.length} item(s) available.`);
    }

    // 2. Find items that ARE available but SHOULD be unavailable (stock <= 0)
    const itemsToMakeUnavailable = await queryRunner.manager
      .createQueryBuilder(MenuItem, 'menuItem')
      .innerJoin('inventory', 'inv', 'inv.menu_item_id = menuItem.id')
      .where('menuItem.is_available = :isAvailable', { isAvailable: true })
      .andWhere('inv.stock_quantity <= 0')
      .getMany();

    if (itemsToMakeUnavailable.length > 0) {
      const ids = itemsToMakeUnavailable.map((item) => item.id);
      await queryRunner.manager.update(MenuItem, ids, { is_available: false });
      this.logger.log(`Scheduled sync: Made ${ids.length} item(s) unavailable.`);
    }

    return {
      madeAvailable: itemsToMakeAvailable.length,
      madeUnavailable: itemsToMakeUnavailable.length,
    };
  } catch (error) {
    this.logger.error('Error during scheduled inventory sync:', error.stack);
    // We don't re-throw here because we don't want to crash the whole app on a cron job failure
    return { madeAvailable: 0, madeUnavailable: 0 };
  } finally {
    await queryRunner.release();
  }
}

  async deductStockForOrder(items: OrderItemPayload[]): Promise<void> {
    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      for (const item of items) {
        // CORRECTED: Use snake_case 'menu_item_id' to match the Inventory entity
        const inventory = await queryRunner.manager.findOne(Inventory, {
          where: { menu_item_id: item.menuItemId },
          lock: { mode: 'pessimistic_write' },
        });

        if (!inventory) {
          throw new NotFoundException(`Inventory for menu item ${item.menuItemId} not found.`);
        }
        
        // CORRECTED: Use snake_case 'stock_quantity' to match the Inventory entity
        if (inventory.stock_quantity < item.quantity) {
          throw new Error(`Insufficient stock for menu item ${item.menuItemId}.`);
        }
        
        // CORRECTED: Use snake_case 'stock_quantity'
        inventory.stock_quantity -= item.quantity;
        
        const log = queryRunner.manager.create(InventoryLog, {
            inventory: inventory,
            change_type: InventoryChangeType.ORDER_DEDUCTION,
            quantity_change: -item.quantity, 
        });
        await queryRunner.manager.save(log);

        // CORRECTED: Use snake_case 'stock_quantity'
        if (inventory.stock_quantity <= 0) {
          this.logger.warn(`Menu item ${item.menuItemId} is now out of stock. Setting as unavailable.`);
          // This uses 'is_available' which correctly matches your MenuItem entity
          await queryRunner.manager.update(MenuItem, 
            { id: item.menuItemId }, 
            { is_available: false }
          );
        }
        
        await queryRunner.manager.save(inventory);
      }

      await queryRunner.commitTransaction();
      this.logger.log(`Successfully deducted stock for ${items.length} items.`);

    } catch (err) {
      await queryRunner.rollbackTransaction();
      this.logger.error('Failed to deduct stock for order. Transaction rolled back.', err.stack);
      throw err;
    } finally {
      await queryRunner.release();
    }
  }

  async getInventoryForRestaurant(restaurantId: string): Promise<Inventory[]> {
    this.logger.log(`Fetching inventory for restaurant ID: ${restaurantId}`);

    const inventoryItems = await this.inventoryRepository.find({
      where: {
        // CORRECTED: Use snake_case 'restaurant_id' to match the Inventory entity
        restaurant_id: restaurantId,
      },
      relations: {
        // CORRECTED: Use snake_case 'menu_item' to match the relation name in the Inventory entity
        menu_item: true,
      },
      order: {
        // CORRECTED: Use snake_case 'menu_item' for ordering
        menu_item: {
            name: 'ASC'
        }
      }
    });

    if (!inventoryItems || inventoryItems.length === 0) {
      this.logger.warn(`No inventory found for restaurant ID: ${restaurantId}`);
      return [];
    }

    return inventoryItems;
  }

  async updateStockManually(menuItemId: string, newQuantity: number): Promise<Inventory> {
  const queryRunner = this.dataSource.createQueryRunner();
  await queryRunner.connect();
  await queryRunner.startTransaction();

  try {
    const inventory = await queryRunner.manager.findOneOrFail(Inventory, {
      where: { menu_item_id: menuItemId },
    });

    const oldQuantity = inventory.stock_quantity;
    const quantityChange = newQuantity - oldQuantity;

    // Only perform writes if the quantity has actually changed
    if (quantityChange !== 0) {
      inventory.stock_quantity = newQuantity;

      // Log the manual change for audit purposes
      const log = queryRunner.manager.create(InventoryLog, {
        inventory: inventory,
        quantity_change: quantityChange,
        change_type: InventoryChangeType.MANUAL_UPDATE,
        reason: 'Manual stock update by owner.', // Optional reason
      });
      
      await queryRunner.manager.save(log);

      // --- LOGIC TO UPDATE MENU AVAILABILITY ---
      // If stock was 0 and is now positive, make it available
      if (oldQuantity <= 0 && newQuantity > 0) {
        await queryRunner.manager.update(MenuItem, { id: menuItemId }, { is_available: true });
        this.logger.log(`Menu item ${menuItemId} is back in stock. Marking as available.`);
      }
      // If stock was positive and is now 0, make it unavailable
      else if (oldQuantity > 0 && newQuantity <= 0) {
        await queryRunner.manager.update(MenuItem, { id: menuItemId }, { is_available: false });
        this.logger.log(`Menu item ${menuItemId} is now out of stock. Marking as unavailable.`);
      }

      await queryRunner.manager.save(inventory);
    }

    await queryRunner.commitTransaction();
    this.logger.log(`Successfully updated stock for menu item ${menuItemId} to ${newQuantity}`);
    return inventory;

  } catch (err) {
    await queryRunner.rollbackTransaction();
    this.logger.error(`Failed to update stock for menu item ${menuItemId}. Transaction rolled back.`, err.stack);
    // Re-throw specific errors if needed, e.g., NotFoundException
    if (err.name === 'EntityNotFoundError') {
        throw new NotFoundException(`Inventory for menu item ${menuItemId} not found.`);
    }
    throw err;
  } finally {
    await queryRunner.release();
  }
}

async replenishStock(items: ReplenishItemDto[]): Promise<{ message: string; count: number }> {
  const queryRunner = this.dataSource.createQueryRunner();
  await queryRunner.connect();
  await queryRunner.startTransaction();

  try {
    // Process all updates concurrently within the transaction
    await Promise.all(
      items.map(async (item) => {
        const inventory = await queryRunner.manager.findOneOrFail(Inventory, {
          where: { menu_item_id: item.menu_item_id },
        });

        const oldQuantity = inventory.stock_quantity;
        const newQuantity = item.stock_quantity;
        const quantityChange = newQuantity - oldQuantity;

        if (quantityChange !== 0) {
          inventory.stock_quantity = newQuantity;

          const log = queryRunner.manager.create(InventoryLog, {
            inventory: inventory,
            quantity_change: quantityChange,
            change_type: InventoryChangeType.RESTOCK,
            reason: 'Bulk replenish operation.',
          });
          await queryRunner.manager.save(log);

          // If item was out of stock and is now restocked, make it available
          if (oldQuantity <= 0 && newQuantity > 0) {
            await queryRunner.manager.update(MenuItem, { id: item.menu_item_id }, { is_available: true });
          }

          await queryRunner.manager.save(inventory);
        }
      }),
    );

    await queryRunner.commitTransaction();
    const successMessage = `Successfully replenished stock for ${items.length} item(s).`;
    this.logger.log(successMessage);
    return { message: successMessage, count: items.length };

  } catch (err) {
    await queryRunner.rollbackTransaction();
    this.logger.error(`Failed to replenish stock. Transaction rolled back.`, err.stack);
    if (err.name === 'EntityNotFoundError') {
        throw new NotFoundException(`One or more inventory items were not found.`);
    }
    throw err;
  } finally {
    await queryRunner.release();
  }
}
}