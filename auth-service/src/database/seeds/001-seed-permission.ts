// src/database/seeds/001-seed-permissions.ts
import { EntityManager, In } from 'typeorm';
import { Permission } from '../../entities/Permission.entity';

export async function up(manager: EntityManager): Promise<void> {
  const permRepo = manager.getRepository(Permission);

  const permissions = [
    'orders.create','orders.view','orders.update','orders.cancel',
    'menu.create','menu.view','menu.update','menu.delete',
    'deliveries.view','deliveries.update','deliveries.assign',
    'restaurants.view','restaurants.manage','restaurant.approval',
    'users.manage','roles.manage','permissions.manage',
    'payments.process','reports.view',
  ];

  for (const name of permissions) {
    const existing = await permRepo.findOne({ where: { name } });
    if (!existing) {
      const p = permRepo.create({ name, description:null });
      await permRepo.save(p);
      console.log(`Created permission: ${name}`);
    } else {
      console.log(`Permission exists: ${name}`);
    }
  }
}

export async function down(manager: EntityManager): Promise<void> {
  const permRepo = manager.getRepository(Permission);
  await permRepo.delete({ name: In([
    'orders.create','orders.view','orders.update','orders.cancel',
    'menu.create','menu.view','menu.update','menu.delete',
    'deliveries.view','deliveries.update','deliveries.assign',
    'restaurants.view','restaurants.manage','restaurant.approval',
    'users.manage','roles.manage','permissions.manage',
    'payments.process','reports.view',
  ]) });
}
