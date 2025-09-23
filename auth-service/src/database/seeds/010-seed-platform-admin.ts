// src/database/seeds/010-seed-admin-with-email.ts
import { EntityManager } from 'typeorm';
import { User } from '../../entities/User.entity';
import { Role } from '../../entities/Role.entity';
import { UserRole } from '../../entities/User-role.entity';
import * as bcrypt from 'bcrypt';
import { MailerProvider } from '../../providers/mailer.provider';

export async function up(manager: EntityManager): Promise<void> {
  const userRepo = manager.getRepository(User);
  const roleRepo = manager.getRepository(Role);
  const userRoleRepo = manager.getRepository(UserRole);

  const adminEmail = process.env.ADMIN_EMAIL ?? 'abikila138@gmail.com' ;
  const adminPassword = process.env.ADMIN_PASSWORD ;

  let admin = await userRepo.findOne({ where: { email: adminEmail } });
  let created = false;
  if (!admin) {
    const hash = await bcrypt.hash(adminPassword, 10);
    admin = userRepo.create({
      email: adminEmail,
      password_hash: hash,
      username: 'platform_admin',
      is_verified: true,
      loyalty_points: 0,
    });
    await userRepo.save(admin);
    created = true;
    console.log(`Created admin user: ${adminEmail}`);
  } else {
    console.log(`Admin user exists: ${adminEmail}`);
  }

  const platformRole = await roleRepo.findOne({ where: { name: 'platform_admin' } });
  if (!platformRole) {
    console.warn('platform_admin role not found; please run role seed first');
    return;
  }

  const existing = await userRoleRepo.findOne({ where: { user_id: admin.user_id, role_id: platformRole.role_id } });
  if (!existing) {
    const ur = userRoleRepo.create({ user_id: admin.user_id, role_id: platformRole.role_id });
    await userRoleRepo.save(ur);
    console.log('Assigned platform_admin role to admin user');
  } else {
    console.log('Admin already has platform_admin role');
  }

  // Email notification (optional)
  if (process.env.MAILER_ENABLED === 'true') {
    try {
      const mailer = new MailerProvider();

      const subject = created
        ? 'Your platform admin account has been created'
        : 'Platform admin account confirmed';

      const text = created
        ? `Your admin account (${adminEmail}) was created. Temporary password: ${adminPassword}. Please change it immediately after first login.`
        : `Your admin account (${adminEmail}) exists and has platform_admin role.`;

      const html = `
        <div style="font-family: Arial, sans-serif; max-width:600px; margin:0 auto;">
          <h2>Meal Delivery — Admin Account</h2>
          <p>Hello,</p>
          <p>${created ? 'An administrative account has been created for you.' : 'Your administrative account was confirmed.'}</p>
          <ul>
            <li><strong>Email:</strong> ${adminEmail}</li>
            ${created ? `<li><strong>Temporary password:</strong> ${adminPassword}</li>` : ''}
          </ul>
          <p>Please log in and change your password immediately. If you did not expect this email, contact support.</p>
          <p>— Meal Delivery Team</p>
        </div>
      `;

      await mailer.sendMail(adminEmail, subject, text, html);
      console.log('Admin notification email sent.');
    } catch (err) {
      console.error('Failed to send admin notification email:', err.message || err);
      // Do NOT throw — seeding should not fail due to optional mailer issues.
    }
  } else {
    console.log('Mailer disabled (set MAILER_ENABLED=true to enable notifications)');
  }
}

export async function down(manager: EntityManager): Promise<void> {
  const userRepo = manager.getRepository(User);
  const adminEmail = process.env.ADMIN_EMAIL || 'admin@platform.test';
  await userRepo.delete({ email: adminEmail });
}
