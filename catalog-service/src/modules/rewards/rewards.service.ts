// src/modules/rewards/rewards.service.ts
import {
  Injectable,
  Logger,
  BadRequestException,
  ConflictException,
  NotFoundException,
  Inject,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, EntityManager, DataSource } from 'typeorm';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import { Cache } from 'cache-manager';
import { Order } from '../../entities/order.entity';
import { RewardPointsBalance } from '../../entities/reward-points-balance.entity';
import { RewardPointsLedger } from '../../entities/reward-points-ledger.entity';
import { RewardRule } from 'src/entities/reward-rule.entity';
import { RewardType } from '../../entities/enums/reward-type.enum';
import { RuleType } from 'src/entities/enums/rule-type.enum';
import { PaginationQueryDto } from './dto/pagination-query.dto';
import { AdminAdjustPointsDto } from './dto/admin-adjust-points.dto';
import { UpdateRewardRuleDto } from './dto/update-reward-rule.dto';
import { CreateRewardRuleDto } from './dto/create-reward-rule.dto';

@Injectable()
export class RewardsService {
  private readonly logger = new Logger(RewardsService.name);

  constructor(
    @InjectRepository(RewardPointsBalance)
    private readonly balanceRepo: Repository<RewardPointsBalance>,
    @InjectRepository(RewardPointsLedger)
    private readonly ledgerRepo: Repository<RewardPointsLedger>,
    @InjectRepository(RewardRule)
    private readonly ruleRepo: Repository<RewardRule>,
    private readonly dataSource: DataSource,
    @Inject(CACHE_MANAGER) private cacheManager: Cache,
  ) {}

  // ================================================================= //
  // =================== CORE LOGIC (DYNAMIC RULES) ================== //
  // ================================================================= //

  async addPointsForCompletedOrder(order: Order, manager: EntityManager): Promise<void> {
    const earningRule = await this.getActiveRule(RuleType.EARNING);

    if (!earningRule) {
      this.logger.warn(`No active EARNING rule found for order ${order.id}. Skipping point award.`);
      return;
    }

    // Use the dynamic conversion rate from the database rule
    // e.g., total_amount (100) * conversion_rate (0.1) = 10 points
    const pointsToAdd = Math.floor(Number(order.total_amount) * Number(earningRule.conversion_rate));

    if (pointsToAdd <= 0) {
      this.logger.log(`Calculated 0 or fewer points to add for order ${order.id}.`);
      return;
    }

    const balanceRepo = manager.getRepository(RewardPointsBalance);
    const ledgerRepo = manager.getRepository(RewardPointsLedger);

    let balance = await balanceRepo.findOne({ where: { customer_id: order.customer_id } });
    if (!balance) {
      balance = balanceRepo.create({ customer_id: order.customer_id, total_points: 0 });
    }

    balance.total_points += pointsToAdd;
    await balanceRepo.save(balance);

    const ledgerEntry = ledgerRepo.create({
      customer_id: order.customer_id,
      order_id: order.id,
      points: pointsToAdd,
      type: RewardType.EARNED,
      description: `Earned points for order #${order.id.split('-')[0]}`,
    });
    await ledgerRepo.save(ledgerEntry);

    this.logger.log(`Awarded ${pointsToAdd} points to customer ${order.customer_id} for order ${order.id}`);
  }

  async processRedemption(
    customerId: string,
    pointsToRedeem: number,
    orderTotal: number,
    manager: EntityManager,
  ): Promise<number> {
    const balanceRepo = manager.getRepository(RewardPointsBalance);
    const balance = await balanceRepo.findOne({ where: { customer_id: customerId } });

    if (!balance || balance.total_points < pointsToRedeem) {
      throw new BadRequestException('Insufficient reward points.');
    }

    const redemptionRule = await this.getActiveRule(RuleType.REDEMPTION);

    if (!redemptionRule) {
      this.logger.error('No active REDEMPTION rule found. Cannot process redemption.');
      throw new BadRequestException('Point redemption is temporarily unavailable.');
    }

    // Use the dynamic conversion rate from the database rule
    // e.g., pointsToRedeem (100) * conversion_rate (0.1) = 10 currency discount
    const potentialDiscount = pointsToRedeem * Number(redemptionRule.conversion_rate);
    const actualDiscount = Math.min(potentialDiscount, orderTotal);

    balance.total_points -= pointsToRedeem;
    await balanceRepo.save(balance);

    this.logger.log(`Processed redemption of ${pointsToRedeem} points for customer ${customerId} as a discount of ${actualDiscount}.`);

    return actualDiscount;
  }

  // ================================================================= //
  // ================= CUSTOMER-FACING ENDPOINTS ===================== //
  // ================================================================= //

  async getBalanceForCustomer(customerId: string): Promise<RewardPointsBalance> {
    const balance = await this.balanceRepo.findOne({
      where: { customer_id: customerId },
    });

    if (!balance) {
      return this.balanceRepo.create({ customer_id: customerId, total_points: 0 });
    }

    return balance;
  }

  async getLedgerForCustomer(
    customerId: string,
    pagination: PaginationQueryDto,
  ): Promise<RewardPointsLedger[]> {
    const { limit, offset } = pagination;
    return this.ledgerRepo.find({
      where: { customer_id: customerId },
      order: { created_at: 'DESC' },
      take: limit,
      skip: offset,
    });
  }

  // ================================================================= //
  // =================== ADMIN-FACING ENDPOINTS ====================== //
  // ================================================================= //

  async createRule(dto: CreateRewardRuleDto): Promise<RewardRule> {
    const existingRule = await this.ruleRepo.findOneBy({ rule_name: dto.rule_name });
    if (existingRule) {
      throw new ConflictException(`A rule with the name "${dto.rule_name}" already exists.`);
    }
    const rule = this.ruleRepo.create(dto);
    return this.ruleRepo.save(rule);
  }

  async findAllRules(): Promise<RewardRule[]> {
    return this.ruleRepo.find({ order: { created_at: 'DESC' } });
  }

  async findRuleById(id: string): Promise<RewardRule> {
    const rule = await this.ruleRepo.findOneBy({ id });
    if (!rule) {
      throw new NotFoundException(`Reward rule with ID "${id}" not found.`);
    }
    return rule;
  }

  async updateRule(id: string, dto: UpdateRewardRuleDto): Promise<RewardRule> {
    const rule = await this.findRuleById(id);
    if (dto.rule_name && dto.rule_name !== rule.rule_name) {
      const existing = await this.ruleRepo.findOneBy({ rule_name: dto.rule_name });
      if (existing) {
        throw new ConflictException(`A rule with the name "${dto.rule_name}" already exists.`);
      }
    }
    Object.assign(rule, dto);
    return this.ruleRepo.save(rule);
  }

  async adminAdjustPoints(dto: AdminAdjustPointsDto): Promise<RewardPointsBalance> {
    const { customer_id, points, reason } = dto;
    return this.dataSource.transaction(async (manager) => {
      const balanceRepo = manager.getRepository(RewardPointsBalance);
      const ledgerRepo = manager.getRepository(RewardPointsLedger);

      let balance = await balanceRepo.findOne({ where: { customer_id } });
      if (!balance) {
        balance = balanceRepo.create({ customer_id, total_points: 0 });
      }

      if (balance.total_points + points < 0) {
        throw new BadRequestException(`Cannot deduct ${Math.abs(points)} points. Customer only has ${balance.total_points} points.`);
      }

      balance.total_points += points;
      const updatedBalance = await balanceRepo.save(balance);

      const ledgerEntry = ledgerRepo.create({
        customer_id,
        order_id: null,
        points,
        type: RewardType.ADJUSTED,
        description: reason,
      });
      await ledgerRepo.save(ledgerEntry);
      
      this.logger.log(`Admin adjustment: ${points} points for customer ${customer_id}. Reason: ${reason}`);
      return updatedBalance;
    });
  }

  // ================================================================= //
  // ===================== PRIVATE HELPER METHODS ==================== //
  // ================================================================= //

  private async getActiveRule(type: RuleType): Promise<RewardRule | null> {
    const cacheKey = `active_reward_rule_${type}`;
    const cachedRule = await this.cacheManager.get<RewardRule>(cacheKey);
    if (cachedRule) {
      this.logger.debug(`Cache HIT for reward rule type: ${type}`);
      return cachedRule;
    }

    this.logger.debug(`Cache MISS for reward rule type: ${type}`);
    const now = new Date();
    const rule = await this.ruleRepo.createQueryBuilder('rule')
      .where('rule.type = :type', { type })
      .andWhere('rule.is_active = :isActive', { isActive: true })
      .andWhere('(rule.start_date IS NULL OR rule.start_date <= :now)', { now })
      .andWhere('(rule.end_date IS NULL OR rule.end_date >= :now)', { now })
      .orderBy('rule.created_at', 'DESC')
      .getOne();

    if (rule) {
      await this.cacheManager.set(cacheKey, rule, 300); // Cache for 5 minutes
    }
    
    return rule;
  }
}