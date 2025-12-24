
import {
  Controller,
  Post,
  Body,
  UseGuards,
  Req,
  Get,
  Param,
  Patch,
  Query,
  BadRequestException,
  ForbiddenException,
  NotFoundException,
  Delete,
  HttpCode,
  Logger,
} from '@nestjs/common';
import { PromoCodeService } from './promo.service';
import { CreatePromoDto } from './dtos/create-promo.dto';
import { UpdatePromoDto } from './dtos/update-promo.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { ApiTags, ApiBearerAuth, ApiOperation, ApiQuery, ApiBody, ApiUnauthorizedResponse, ApiForbiddenResponse, ApiOkResponse } from '@nestjs/swagger';
import { Roles } from 'src/common/decorator/roles.decorator';
import { DeletePromoCodeDto } from './dtos/delete-promo.dto';


@ApiTags('Promos')
@Controller('promos')
export class PromoCodesController {
  constructor(private readonly promoSvc: PromoCodeService) {}

  private getUserInfo(req: any) {
    const user = req.user ?? {};
    return {
      userId: user.userId ?? user.sub ?? user.id,
      roles: (user.roles ?? []) as string[],
      restaurantId: user.restaurantId ?? null,
    };
  }

  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('access-token')
  @Post()
  @ApiOperation({ summary: 'Create a promo code (platform admins or restaurant owners)' })
  async create(@Req() req: any, @Body() dto: CreatePromoDto) {
    const user = this.getUserInfo(req);

    if (dto.issuer_type === 'platform' && !user.roles.includes('platform_admin')) {
      throw new ForbiddenException('Only platform admins can create platform promos');
    }

    if (dto.issuer_type === 'restaurant') {
      const actorRestaurantId = user.restaurantId;
      if (!dto.applicable_restaurant_id && !actorRestaurantId) {
        throw new BadRequestException('Restaurant-scoped promo must provide applicable_restaurant_id or be created by restaurant owner token with restaurantId');
      }
      if (dto.applicable_restaurant_id && actorRestaurantId && dto.applicable_restaurant_id !== actorRestaurantId && !user.roles.includes('platform_admin')) {
        throw new ForbiddenException('You can only create promos for your own restaurant');
      }
    }

    return this.promoSvc.create(dto as any, { userId: user.userId, roles: user.roles, restaurantId: user.restaurantId });
  }

  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('access-token')
  @Get()
  @ApiOperation({ summary: 'List promos (platform admins see all; restaurant_owner sees their promos)' })
  @ApiQuery({ name: 'limit', required: false })
  @ApiQuery({ name: 'offset', required: false })
  @ApiQuery({ name: 'active', required: false })
  async list(@Req() req: any, @Query('limit') limit?: string, @Query('offset') offset?: string, @Query('active') active?: string) {
    const l = limit ? Math.min(Number(limit), 200) : 50;
    const o = offset ? Math.max(Number(offset), 0) : 0;
    const user = this.getUserInfo(req);
    const filters: any = {};

    if (!user.roles.includes('platform_admin')) {
      if (user.restaurantId) filters.restaurantId = user.restaurantId;
    }
    if (typeof active !== 'undefined') filters.active = active === 'true';

    return this.promoSvc.list(l, o, filters);
  }

  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('access-token')
  @Get(':idOrCode')
  @ApiOperation({ summary: 'Get promo by id or code' })
  async getByIdOrCode(@Req() req: any, @Param('idOrCode') idOrCode: string) {
    const user = this.getUserInfo(req);
    let promo: any = null;
    try {
      promo = await this.promoSvc.findById(idOrCode);
    } catch {
      try {
        promo = await this.promoSvc.findByCode(idOrCode);
      } catch {
        throw new NotFoundException('Promo not found');
      }
    }

    if (!user.roles.includes('platform_admin')) {
      if (promo.applicable_restaurant_id && user.restaurantId && promo.applicable_restaurant_id !== user.restaurantId) {
        throw new ForbiddenException('Not allowed to view this promo');
      }
      if (!promo.applicable_restaurant_id && promo.issuer_type === 'platform') {
        throw new ForbiddenException('Not allowed to view this promo');
      }
    }

    return promo;
  }

@UseGuards(JwtAuthGuard)
@ApiBearerAuth('access-token')
@Patch(':idOrCode')
@UseGuards(JwtAuthGuard)
@Roles('platform_admin')
@ApiOperation({ summary: 'Update a promo (platform admins or promo owner)' })
@ApiBody({
  type: UpdatePromoDto,
  description: 'Fields to update (all optional)',
  examples: {
    default: {
      summary: 'Update promo example',
      value: {
        code: 'SUMMER10',
        discount_type: 'percentage',
        discount_value: 15,
        issuer_type: 'platform',
        restaurant_share_percent: 50,
        max_uses: 200,
        expiry_date: '2025-12-31',
        active: true
      }
    }
  }
})
async update(@Req() req: any, @Param('idOrCode') idOrCode: string, @Body() dto: UpdatePromoDto) {
  const user = this.getUserInfo(req);

  let existing: any = null;
  try {
    existing = await this.promoSvc.findById(idOrCode);
  } catch {
    try {
      existing = await this.promoSvc.findByCode(idOrCode);
    } catch {
      throw new NotFoundException('Promo not found');
    }
  }

  if (existing.issuer_type === 'platform' && !user.roles.includes('platform_admin')) {
    throw new ForbiddenException('Only platform admins can update platform promos');
  }

  if (!user.roles.includes('platform_admin') && existing.applicable_restaurant_id && user.restaurantId && existing.applicable_restaurant_id !== user.restaurantId) {
    throw new ForbiddenException('Cannot update promos for other restaurants');
  }

  return this.promoSvc.update(idOrCode, dto as any);
}


@Delete()
@HttpCode(200)
@ApiOperation({ summary: 'Delete promo codes by promoId, restaurantId, or platform-issued promos' })
@ApiBearerAuth('access-token')
@ApiOkResponse({ description: 'Successfully deleted promo code(s)', schema: { example: { message: 'Successfully deleted 2 promo code(s)' } } })
@ApiUnauthorizedResponse({ description: 'Unauthorized' })
@ApiForbiddenResponse({ description: 'Forbidden — requires platform admin role' })
@UseGuards(JwtAuthGuard)
@Roles('platform_admin')
async delete(@Query() query: DeletePromoCodeDto) {
const result = await this.promoSvc.deletePromos(query);
return { message: `Successfully deleted ${result.deleted} promo code(s)` };
}
}
