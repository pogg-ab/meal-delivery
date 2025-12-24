// src/database/seeds/003-seed-role-permissions.ts
import { EntityManager } from 'typeorm';
import { Role } from '../../entities/Role.entity';
import { Permission } from '../../entities/Permission.entity';
import { RolePermission } from '../../entities/Role-permission.entity';

export async function up(manager: EntityManager): Promise<void> {
  const roleRepo = manager.getRepository(Role);
  const permRepo = manager.getRepository(Permission);
  const rpRepo = manager.getRepository(RolePermission);

  const rolePermissionsMap: Record<string, string[]> = {
    platform_admin: [
      'orders.create','orders.view','orders.update','orders.cancel',
      'menu.create','menu.view','menu.update','menu.delete',
      'deliveries.view','deliveries.update','deliveries.assign',
      'restaurants.view','restaurants.manage','restaurant.approval',
      'users.manage','roles.manage','permissions.manage',
      'payments.process','reports.view',
    ],
    restaurant_owner: [
      'menu.create','menu.view','menu.update','menu.delete',
      'orders.view','orders.update','restaurants.view','restaurants.manage','reports.view',
    ],
    delivery_personnel: ['deliveries.view','deliveries.update','orders.view'],
    customer: ['orders.create','orders.view','payments.process'],
  };

  for (const [roleName, permNames] of Object.entries(rolePermissionsMap)) {
    const role = await roleRepo.findOne({ where: { name: roleName } });
    if (!role) {
      console.warn(`Role not found, skipping: ${roleName}`);
      continue;
    }

    for (const permName of permNames) {
      const perm = await permRepo.findOne({ where: { name: permName } });
      if (!perm) {
        console.warn(`Permission not found, skipping: ${permName}`);
        continue;
      }

      const exists = await rpRepo.findOne({ where: { role_id: role.role_id, permission_id: perm.permission_id } });
      if (!exists) {
        const rp = rpRepo.create({ role_id: role.role_id, permission_id: perm.permission_id });
        await rpRepo.save(rp);
        console.log(`Attached ${permName} -> ${roleName}`);
      } else {
        console.log(`Mapping exists: ${permName} -> ${roleName}`);
      }
    }
  }
}

export async function down(manager: EntityManager): Promise<void> {
  const rpRepo = manager.getRepository(RolePermission);
  await rpRepo.clear(); // be careful: clears all mappings
}
