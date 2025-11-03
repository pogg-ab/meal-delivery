// src/modules/promos/promo-code.service.ts
// import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
// import { Repository, EntityManager } from 'typeorm';
// import { PromoCode } from '../../entities/promo-code.entity';
// import { InjectRepository } from '@nestjs/typeorm';

// @Injectable()
// export class PromoCodeService {
//   constructor(
//     @InjectRepository(PromoCode)
//     private readonly promoRepo: Repository<PromoCode>,
//   ) {}

//   private round2(v: number) {
//     return Math.round((Number(v) + Number.EPSILON) * 100) / 100;
//   }

//   private genCode(len = 8) {
//     const chars = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
//     let out = '';
//     for (let i = 0; i < len; i++) out += chars[Math.floor(Math.random() * chars.length)];
//     return out;
//   }

//   private async ensureUniqueCode(proposed: string) {
//     let code = proposed.toUpperCase();
//     for (let i = 0; i < 6; i++) {
//       const exists = await this.promoRepo.findOne({ where: { code } });
//       if (!exists) return code;
//       code = `${proposed}${(Math.floor(Math.random() * 900) + 100).toString().slice(0, 3)}`.toUpperCase();
//     }
//     return `${proposed}-${Date.now().toString(36).slice(-4)}`.toUpperCase();
//   }

//   // computeSharedPromo: platform collects platform fee immediately; platform_topup_needed is deferred
//   private computeSharedPromo(
//     grossAmount: number,
//     discountAmount: number,
//     restaurantSharePercent: number, // 0..100
//     platformFeeRate = 0.05,
//   ) {
//     const g = this.round2(grossAmount);
//     const d = this.round2(discountAmount);
//     const customer_pays = this.round2(Math.max(0, g - d));
//     const platform_fee_amount = this.round2(g * platformFeeRate);

//     const pct = Math.min(100, Math.max(0, Number(restaurantSharePercent ?? 50)));
//     const restaurant_discount = this.round2((d * pct) / 100);
//     const platform_discount = this.round2(d - restaurant_discount); // deferred top-up

//     let platform_topup_needed = 0;
//     let platform_split = 0;
//     let restaurant_split = 1;

//     if (customer_pays <= 0) {
//       platform_split = 0;
//       restaurant_split = 0;
//       platform_topup_needed = this.round2(platform_discount);
//     } else {
//       platform_split = this.round2(platform_fee_amount / customer_pays);
//       if (platform_split > 0.999999) platform_split = 0.999999;
//       restaurant_split = this.round2(1 - platform_split);
//       platform_topup_needed = this.round2(platform_discount);
//     }

//     return {
//       gross: g,
//       discount: d,
//       restaurant_discount,
//       platform_discount,
//       customer_pays,
//       platform_fee_amount,
//       desired_splits: { restaurant_split, platform_split },
//       platform_topup_needed,
//     };
//   }

//   // Admin methods
//   async create(dto: any, createdBy: { userId: string; roles?: string[]; restaurantId?: string | null }) {
//     if (dto.issuer_type === 'restaurant' && !dto.applicable_restaurant_id && !createdBy.restaurantId) {
//       throw new BadRequestException('Restaurant-scoped promo must include applicable_restaurant_id or be created by a restaurant owner with restaurantId.');
//     }
//     if (dto.issuer_type === 'platform' && (!createdBy.roles || !createdBy.roles.includes('platform_admin'))) {
//       throw new BadRequestException('Only platform admins can create platform promos.');
//     }

//     let code = dto.code ? String(dto.code).trim().toUpperCase() : this.genCode(8);
//     code = await this.ensureUniqueCode(code);

//     const rec = this.promoRepo.create({
//       code,
//       discount_type: dto.discount_type,
//       discount_value: dto.discount_value,
//       issuer_type: dto.issuer_type,
//       applicable_restaurant_id: dto.applicable_restaurant_id ?? createdBy.restaurantId ?? null,
//       restaurant_share_percent: dto.restaurant_share_percent ?? (dto.issuer_type === 'shared' ? 50 : null),
//       max_uses: dto.max_uses ?? null,
//       expiry_date: dto.expiry_date ? new Date(dto.expiry_date) : null,
//       active: typeof dto.active === 'boolean' ? dto.active : true,
//       uses_count: 0,
//       meta: { created_by: createdBy.userId, created_at: new Date().toISOString(), ...(dto.meta ?? {}) },
//     } as any);

//     return this.promoRepo.save(rec);
//   }

//   async findByCode(code: string) {
//     const c = (code ?? '').trim().toUpperCase();
//     const p = await this.promoRepo.findOne({ where: { code: c } });
//     if (!p) throw new NotFoundException('Promo code not found');
//     return p;
//   }

//   async findById(id: string) {
//     const p = await this.promoRepo.findOne({ where: { id } });
//     if (!p) throw new NotFoundException('Promo not found');
//     return p;
//   }

//   async update(idOrCode: string, dto: any) {
//     let rec: PromoCode | null = null;

//     try {
//       rec = await this.findById(idOrCode);
//     } catch {
//       try {
//         rec = await this.findByCode(idOrCode);
//       } catch {
//         rec = null;
//       }
//     }

//     if (!rec) throw new NotFoundException('Promo not found');

//     rec.discount_type = dto.discount_type ?? rec.discount_type;
//     rec.discount_value = dto.discount_value ?? rec.discount_value;
//     rec.issuer_type = dto.issuer_type ?? rec.issuer_type;
//     rec.applicable_restaurant_id = dto.applicable_restaurant_id ?? rec.applicable_restaurant_id;
//     rec.restaurant_share_percent = dto.restaurant_share_percent ?? rec.restaurant_share_percent;
//     rec.max_uses = typeof dto.max_uses === 'undefined' ? rec.max_uses : dto.max_uses;
//     rec.expiry_date = dto.expiry_date ? new Date(dto.expiry_date) : rec.expiry_date;
//     rec.active = typeof dto.active === 'boolean' ? dto.active : rec.active;
//     rec.meta = { ...(rec.meta ?? {}), updated_at: new Date().toISOString(), ...(dto.meta ?? {}) };

//     return this.promoRepo.save(rec);
//   }

//   async list(limit = 50, offset = 0, filters?: { restaurantId?: string | null; active?: boolean | null }) {
//     const qb = this.promoRepo.createQueryBuilder('p').orderBy('p.created_at', 'DESC').limit(limit).offset(offset);
//     if (filters?.restaurantId) qb.andWhere('p.applicable_restaurant_id = :rid', { rid: filters.restaurantId });
//     if (typeof filters?.active === 'boolean') qb.andWhere('p.active = :act', { act: filters.active });
//     const [rows, total] = await qb.getManyAndCount();
//     return { rows, total };
//   }

//   // applyPromo (transactional)
//   async applyPromo(
//     manager: EntityManager,
//     codeStr: string | undefined | null,
//     grossAmount: number,
//     restaurantId?: string | null,
//     platformFeeRate = 0.05,
//   ) {
//     if (!codeStr) {
//       const gross = this.round2(grossAmount);
//       const platform_fee_amount = this.round2(gross * platformFeeRate);
//       const customer_pays = gross;
//       const platform_split = customer_pays > 0 ? this.round2(platform_fee_amount / customer_pays) : 0;
//       const restaurant_split = this.round2(1 - platform_split);
//       return {
//         applied: false,
//         discount_amount: 0,
//         restaurant_discount: 0,
//         platform_discount: 0,
//         customer_pays,
//         gross,
//         platform_fee_amount,
//         desired_splits: { restaurant_split, platform_split },
//         platform_topup_needed: 0,
//         promo: null,
//       };
//     }

//     const code = String(codeStr).trim().toUpperCase();
//     const promoRepo = manager.getRepository(PromoCode);
//     const promo = await promoRepo.findOne({ where: { code } });

//     if (!promo) throw new NotFoundException('Promo code not found');
//     if (!promo.active) throw new BadRequestException('Promo code not active');
//     if (promo.expiry_date && promo.expiry_date < new Date()) throw new BadRequestException('Promo code expired');
//     if (promo.applicable_restaurant_id && promo.applicable_restaurant_id !== restaurantId)
//       throw new BadRequestException('Promo not applicable for this restaurant');
//     if (promo.max_uses && promo.uses_count >= promo.max_uses) throw new BadRequestException('Promo max uses exceeded');

//     let discount_amount = 0;
//     if (promo.discount_type === 'percentage') {
//       discount_amount = (Number(grossAmount) * Number(promo.discount_value)) / 100;
//     } else {
//       discount_amount = Number(promo.discount_value);
//     }
//     discount_amount = Math.max(0, this.round2(discount_amount));

//     const restaurantSharePercent =
//       promo.issuer_type === 'restaurant' ? 100 : promo.issuer_type === 'platform' ? 0 : Number(promo.restaurant_share_percent ?? 50);

//     const calc = this.computeSharedPromo(grossAmount, discount_amount, restaurantSharePercent, platformFeeRate);

//     promo.uses_count = (promo.uses_count ?? 0) + 1;
//     await promoRepo.save(promo);

//     return {
//       applied: true,
//       promo: {
//         id: promo.id,
//         code: promo.code,
//         issuer_type: promo.issuer_type,
//         discount_type: promo.discount_type,
//         discount_value: Number(promo.discount_value),
//         restaurant_share_percent: promo.restaurant_share_percent,
//       },
//       discount_amount: calc.discount,
//       restaurant_discount: calc.restaurant_discount,
//       platform_discount: calc.platform_discount,
//       customer_pays: calc.customer_pays,
//       gross: calc.gross,
//       platform_fee_amount: calc.platform_fee_amount,
//       desired_splits: calc.desired_splits,
//       platform_topup_needed: calc.platform_topup_needed,
//     };
//   }
// }

import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { Repository, EntityManager } from 'typeorm';
import { PromoCode } from '../../entities/promo-code.entity';
import { InjectRepository } from '@nestjs/typeorm';
import { v4 as uuidv4 } from 'uuid';

@Injectable()
export class PromoCodeService {
  constructor(
    @InjectRepository(PromoCode)
    private readonly promoRepo: Repository<PromoCode>,
  ) {}

  private round2(v: number) {
    return Math.round((Number(v) + Number.EPSILON) * 100) / 100;
  }

  private genCode(len = 8) {
    const chars = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
    let out = '';
    for (let i = 0; i < len; i++) out += chars[Math.floor(Math.random() * chars.length)];
    return out;
  }

  private async ensureUniqueCode(proposed: string) {
    let code = proposed.toUpperCase();
    for (let i = 0; i < 6; i++) {
      const exists = await this.promoRepo.findOne({ where: { code } });
      if (!exists) return code;
      code = `${proposed}${(Math.floor(Math.random() * 900) + 100).toString().slice(0, 3)}`.toUpperCase();
    }
    return `${proposed}-${Date.now().toString(36).slice(-4)}`.toUpperCase();
  }

  // computeSharedPromo: platform collects platform fee immediately; platform_topup_needed is deferred
  private computeSharedPromo(
    grossAmount: number,
    discountAmount: number,
    restaurantSharePercent: number, // 0..100
    platformFeeRate = 0.05,
  ) {
    const g = this.round2(grossAmount);
    const d = this.round2(discountAmount);
    const customer_pays = this.round2(Math.max(0, g - d));
    const platform_fee_amount = this.round2(g * platformFeeRate);

    const pct = Math.min(100, Math.max(0, Number(restaurantSharePercent ?? 50)));
    const restaurant_discount = this.round2((d * pct) / 100);
    const platform_discount = this.round2(d - restaurant_discount); // deferred top-up

    let platform_topup_needed = 0;
    let platform_split = 0;
    let restaurant_split = 1;

    if (customer_pays <= 0) {
      platform_split = 0;
      restaurant_split = 0;
      platform_topup_needed = this.round2(platform_discount);
    } else {
      platform_split = this.round2(platform_fee_amount / customer_pays);
      if (platform_split > 0.999999) platform_split = 0.999999;
      restaurant_split = this.round2(1 - platform_split);
      platform_topup_needed = this.round2(platform_discount);
    }

    return {
      gross: g,
      discount: d,
      restaurant_discount,
      platform_discount,
      customer_pays,
      platform_fee_amount,
      desired_splits: { restaurant_split, platform_split },
      platform_topup_needed,
    };
  }

  // Admin methods
  async create(dto: any, createdBy: { userId: string; roles?: string[]; restaurantId?: string | null }) {
    if (dto.issuer_type === 'restaurant' && !dto.applicable_restaurant_id && !createdBy.restaurantId) {
      throw new BadRequestException('Restaurant-scoped promo must include applicable_restaurant_id or be created by a restaurant owner with restaurantId.');
    }
    if (dto.issuer_type === 'platform' && (!createdBy.roles || !createdBy.roles.includes('platform_admin'))) {
      throw new BadRequestException('Only platform admins can create platform promos.');
    }

    let code = dto.code ? String(dto.code).trim().toUpperCase() : this.genCode(8);
    code = await this.ensureUniqueCode(code);

    // Build the record and explicitly set an id using uuidv4 to avoid relying on DB-side UUID defaults
    const rec = this.promoRepo.create({
      id: uuidv4(),
      code,
      discount_type: dto.discount_type,
      discount_value: dto.discount_value,
      issuer_type: dto.issuer_type,
      applicable_restaurant_id: dto.applicable_restaurant_id ?? createdBy.restaurantId ?? null,
      restaurant_share_percent: dto.restaurant_share_percent ?? (dto.issuer_type === 'shared' ? 50 : null),
      max_uses: dto.max_uses ?? null,
      expiry_date: dto.expiry_date ? new Date(dto.expiry_date) : null,
      active: typeof dto.active === 'boolean' ? dto.active : true,
      uses_count: 0,
      meta: { created_by: createdBy.userId, created_at: new Date().toISOString(), ...(dto.meta ?? {}) },
    } as any);

    return this.promoRepo.save(rec);
  }

  async findByCode(code: string) {
    const c = (code ?? '').trim().toUpperCase();
    const p = await this.promoRepo.findOne({ where: { code: c } });
    if (!p) throw new NotFoundException('Promo code not found');
    return p;
  }

  async findById(id: string) {
    const p = await this.promoRepo.findOne({ where: { id } });
    if (!p) throw new NotFoundException('Promo not found');
    return p;
  }

  async update(idOrCode: string, dto: any) {
    let rec: PromoCode | null = null;

    try {
      rec = await this.findById(idOrCode);
    } catch {
      try {
        rec = await this.findByCode(idOrCode);
      } catch {
        rec = null;
      }
    }

    if (!rec) throw new NotFoundException('Promo not found');

    rec.discount_type = dto.discount_type ?? rec.discount_type;
    rec.discount_value = dto.discount_value ?? rec.discount_value;
    rec.issuer_type = dto.issuer_type ?? rec.issuer_type;
    rec.applicable_restaurant_id = dto.applicable_restaurant_id ?? rec.applicable_restaurant_id;
    rec.restaurant_share_percent = dto.restaurant_share_percent ?? rec.restaurant_share_percent;
    rec.max_uses = typeof dto.max_uses === 'undefined' ? rec.max_uses : dto.max_uses;
    rec.expiry_date = dto.expiry_date ? new Date(dto.expiry_date) : rec.expiry_date;
    rec.active = typeof dto.active === 'boolean' ? dto.active : rec.active;
    rec.meta = { ...(rec.meta ?? {}), updated_at: new Date().toISOString(), ...(dto.meta ?? {}) };

    return this.promoRepo.save(rec);
  }

  async list(limit = 50, offset = 0, filters?: { restaurantId?: string | null; active?: boolean | null }) {
    const qb = this.promoRepo.createQueryBuilder('p').orderBy('p.created_at', 'DESC').limit(limit).offset(offset);
    if (filters?.restaurantId) qb.andWhere('p.applicable_restaurant_id = :rid', { rid: filters.restaurantId });
    if (typeof filters?.active === 'boolean') qb.andWhere('p.active = :act', { act: filters.active });
    const [rows, total] = await qb.getManyAndCount();
    return { rows, total };
  }

  // applyPromo (transactional)
  async applyPromo(
    manager: EntityManager,
    codeStr: string | undefined | null,
    grossAmount: number,
    restaurantId?: string | null,
    platformFeeRate = 0.05,
  ) {
    if (!codeStr) {
      const gross = this.round2(grossAmount);
      const platform_fee_amount = this.round2(gross * platformFeeRate);
      const customer_pays = gross;
      const platform_split = customer_pays > 0 ? this.round2(platform_fee_amount / customer_pays) : 0;
      const restaurant_split = this.round2(1 - platform_split);
      return {
        applied: false,
        discount_amount: 0,
        restaurant_discount: 0,
        platform_discount: 0,
        customer_pays,
        gross,
        platform_fee_amount,
        desired_splits: { restaurant_split, platform_split },
        platform_topup_needed: 0,
        promo: null,
      };
    }

    const code = String(codeStr).trim().toUpperCase();
    const promoRepo = manager.getRepository(PromoCode);
    const promo = await promoRepo.findOne({ where: { code } });

    if (!promo) throw new NotFoundException('Promo code not found');
    if (!promo.active) throw new BadRequestException('Promo code not active');
    if (promo.expiry_date && promo.expiry_date < new Date()) throw new BadRequestException('Promo code expired');
    if (promo.applicable_restaurant_id && promo.applicable_restaurant_id !== restaurantId)
      throw new BadRequestException('Promo not applicable for this restaurant');
    if (promo.max_uses && promo.uses_count >= promo.max_uses) throw new BadRequestException('Promo max uses exceeded');

    let discount_amount = 0;
    if (promo.discount_type === 'percentage') {
      discount_amount = (Number(grossAmount) * Number(promo.discount_value)) / 100;
    } else {
      discount_amount = Number(promo.discount_value);
    }
    discount_amount = Math.max(0, this.round2(discount_amount));

    const restaurantSharePercent =
      promo.issuer_type === 'restaurant' ? 100 : promo.issuer_type === 'platform' ? 0 : Number(promo.restaurant_share_percent ?? 50);

    const calc = this.computeSharedPromo(grossAmount, discount_amount, restaurantSharePercent, platformFeeRate);

    promo.uses_count = (promo.uses_count ?? 0) + 1;
    await promoRepo.save(promo);

    return {
      applied: true,
      promo: {
        id: promo.id,
        code: promo.code,
        issuer_type: promo.issuer_type,
        discount_type: promo.discount_type,
        discount_value: Number(promo.discount_value),
        restaurant_share_percent: promo.restaurant_share_percent,
      },
      discount_amount: calc.discount,
      restaurant_discount: calc.restaurant_discount,
      platform_discount: calc.platform_discount,
      customer_pays: calc.customer_pays,
      gross: calc.gross,
      platform_fee_amount: calc.platform_fee_amount,
      desired_splits: calc.desired_splits,
      platform_topup_needed: calc.platform_topup_needed,
    };
  }
}

