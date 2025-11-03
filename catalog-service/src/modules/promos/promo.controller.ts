// // src/modules/promos/promo-codes.controller.ts
// import {
//   Controller,
//   Post,
//   Body,
//   UseGuards,
//   Req,
//   Get,
//   Param,
//   Patch,
//   Query,
//   BadRequestException,
//   ForbiddenException,
//   NotFoundException,
// } from '@nestjs/common';
// import { PromoCodeService } from './promo.service';
// import { CreatePromoDto } from './dtos/create-promo.dto';
// import { UpdatePromoDto } from './dtos/update-promo.dto';
// import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
// import { ApiTags, ApiBearerAuth, ApiOperation, ApiQuery } from '@nestjs/swagger';

// @ApiTags('Promos')
// @Controller('promos')
// export class PromoCodesController {
//   constructor(private readonly promoSvc: PromoCodeService) {}

//   private getUserInfo(req: any) {
//     const user = req.user ?? {};
//     return {
//       userId: user.userId ?? user.sub ?? user.id,
//       roles: (user.roles ?? []) as string[],
//       restaurantId: user.restaurantId ?? null,
//     };
//   }

//   // Create a promo
//   @UseGuards(JwtAuthGuard)
//   @ApiBearerAuth('access-token')
//   @Post()
//   @ApiOperation({ summary: 'Create a promo code (platform admins or restaurant owners)' })
//   async create(@Req() req: any, @Body() dto: CreatePromoDto) {
//     const user = this.getUserInfo(req);
//     const roles = user.roles;

//     // Validation & permissions
//     if (dto.issuer_type === 'platform' && !roles.includes('platform_admin')) {
//       throw new ForbiddenException('Only platform admins can create platform promos');
//     }

//     if (dto.issuer_type === 'restaurant') {
//       const actorRestaurantId = user.restaurantId;
//       if (!dto.applicable_restaurant_id && !actorRestaurantId) {
//         throw new BadRequestException(
//           'Restaurant-scoped promo must provide applicable_restaurant_id or be created by restaurant owner token with restaurantId',
//         );
//       }
//       if (dto.applicable_restaurant_id && actorRestaurantId && dto.applicable_restaurant_id !== actorRestaurantId && !roles.includes('platform_admin')) {
//         throw new ForbiddenException('You can only create promos for your own restaurant');
//       }
//     }

//     const created = await this.promoSvc.create(dto as any, { userId: user.userId, roles: user.roles, restaurantId: user.restaurantId });
//     return created;
//   }

//   // List promos with pagination and optional active filter
//   @UseGuards(JwtAuthGuard)
//   @ApiBearerAuth('access-token')
//   @Get()
//   @ApiOperation({ summary: 'List promos (platform admins see all; restaurant_owner sees their promos)' })
//   @ApiQuery({ name: 'limit', required: false })
//   @ApiQuery({ name: 'offset', required: false })
//   @ApiQuery({ name: 'active', required: false })
//   async list(@Req() req: any, @Query('limit') limit?: string, @Query('offset') offset?: string, @Query('active') active?: string) {
//     const l = limit ? Math.min(Number(limit), 200) : 50;
//     const o = offset ? Math.max(Number(offset), 0) : 0;
//     const user = this.getUserInfo(req);
//     const filters: any = {};

//     if (!user.roles.includes('platform_admin')) {
//       // restrict to user's restaurant promos if present
//       if (user.restaurantId) filters.restaurantId = user.restaurantId;
//     }
//     if (typeof active !== 'undefined') {
//       filters.active = active === 'true';
//     }

//     return this.promoSvc.list(l, o, filters);
//   }

//   // Get promo by id or code
//   @UseGuards(JwtAuthGuard)
//   @ApiBearerAuth('access-token')
//   @Get(':idOrCode')
//   @ApiOperation({ summary: 'Get promo by id or code' })
//   async getByIdOrCode(@Req() req: any, @Param('idOrCode') idOrCode: string) {
//     const user = this.getUserInfo(req);

//     // Attempt findById, fallback to findByCode
//     let promo: any = null;
//     try {
//       promo = await this.promoSvc.findById(idOrCode);
//     } catch (e) {
//       try {
//         promo = await this.promoSvc.findByCode(idOrCode);
//       } catch (er) {
//         throw new NotFoundException('Promo not found');
//       }
//     }

//     // If not platform admin, enforce restaurant scoping visibility
//     if (!user.roles.includes('platform_admin')) {
//       if (promo.applicable_restaurant_id && user.restaurantId && promo.applicable_restaurant_id !== user.restaurantId) {
//         throw new ForbiddenException('Not allowed to view this promo');
//       }
//       if (!promo.applicable_restaurant_id && promo.issuer_type === 'platform') {
//         // platform promos are not visible to non-admins
//         throw new ForbiddenException('Not allowed to view this promo');
//       }
//     }

//     return promo;
//   }

//   // Update promo by id or code
//   @UseGuards(JwtAuthGuard)
//   @ApiBearerAuth('access-token')
//   @Patch(':idOrCode')
//   @ApiOperation({ summary: 'Update a promo (platform admins or promo owner)' })
//   async update(@Req() req: any, @Param('idOrCode') idOrCode: string, @Body() dto: UpdatePromoDto) {
//     const user = this.getUserInfo(req);

//     // Fetch existing (try id then code)
//     let existing: any = null;
//     try {
//       existing = await this.promoSvc.findById(idOrCode);
//     } catch {
//       try {
//         existing = await this.promoSvc.findByCode(idOrCode);
//       } catch {
//         throw new NotFoundException('Promo not found');
//       }
//     }

//     // Authorization: only platform_admin can update platform promos
//     if (existing.issuer_type === 'platform' && !user.roles.includes('platform_admin')) {
//       throw new ForbiddenException('Only platform admins can update platform promos');
//     }

//     // Restaurant owner can update their own promos only
//     if (!user.roles.includes('platform_admin') && existing.applicable_restaurant_id && user.restaurantId && existing.applicable_restaurant_id !== user.restaurantId) {
//       throw new ForbiddenException('Cannot update promos for other restaurants');
//     }

//     // All checks passed -> update
//     const updated = await this.promoSvc.update(idOrCode, dto as any);
//     return updated;
//   }
// }



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
} from '@nestjs/common';
import { PromoCodeService } from './promo.service';
import { CreatePromoDto } from './dtos/create-promo.dto';
import { UpdatePromoDto } from './dtos/update-promo.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { ApiTags, ApiBearerAuth, ApiOperation, ApiQuery } from '@nestjs/swagger';

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
  @ApiOperation({ summary: 'Update a promo (platform admins or promo owner)' })
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
}
