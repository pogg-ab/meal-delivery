// src/database/seeds/002-seed-roles.ts
import { EntityManager, In } from 'typeorm';
import { Role } from '../../entities/Role.entity';

export async function up(manager: EntityManager): Promise<void> {
  const roleRepo = manager.getRepository(Role);

  const roles = [
    { name: 'platform_admin', description: 'Full platform administrator (superuser)' },
    { name: 'restaurant_owner', description: 'Restaurant owner/manager' },
    { name: 'delivery_personnel', description: 'Delivery staff' },
    { name: 'customer', description: 'Customer' },
  ];

  for (const r of roles) {
    const existing = await roleRepo.findOne({ where: { name: r.name } });
    if (!existing) {
      const role = roleRepo.create(r);
      await roleRepo.save(role);
      console.log(`Created role: ${r.name}`);
    } else {
      console.log(`Role exists: ${r.name}`);
    }
  }
}

export async function down(manager: EntityManager): Promise<void> {
  const roleRepo = manager.getRepository(Role);
  await roleRepo.delete({ name: In(['platform_admin','restaurant_owner','delivery_personnel','customer']) });
}
