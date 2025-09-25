import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { Inventory } from '../../entities/inventory.entity';
import { InventoryLog, InventoryChangeType } from '../../entities/inventory-log.entity';
import { MenuItem } from '../../entities/menu-item.entity';

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
            inventory_id: inventory.id,
            change_type: InventoryChangeType.ORDER_DEDUCTION,
            quantity_change: -item.quantity, 
        });
        await queryRunner.manager.save(log);

        
        if (inventory.stock_quantity <= 0) {
          this.logger.warn(`Menu item ${item.menuItemId} is now out of stock. Setting as unavailable.`);
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
      throw err; // Re-throw the error so the event can be retried if needed
    } finally {
      await queryRunner.release();
    }
  }
}