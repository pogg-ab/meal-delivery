// import {
//   Controller,
//   Post,
//   Body,
//   UseGuards,
//   Req,
//   Param,
//   Get,
//   Patch,
//   Logger,
//   ParseUUIDPipe,
//   Query,
// } from '@nestjs/common';
// import { OrdersService } from './order.service';
// import { CreateOrderDto } from './dtos/create-order.dto';
// import { OwnerResponseDto } from './dtos/owner-response.dto';
// import { ComingDto } from './dtos/coming.dto';
// import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
// import {
//   ApiTags,
//   ApiOperation,
//   ApiResponse,
//   ApiBearerAuth,
//   ApiBody,
//   ApiParam,
//   ApiQuery,
// } from '@nestjs/swagger';
// import { EventPattern, Payload } from '@nestjs/microservices';
// import { ToggleAvailabilityDto } from './dtos/toggle-availability.dto';
// import { OrderResponseDto } from './dtos/order-response.dto';
// import { CancelOrderDto } from './dtos/cancel-order.dto';
// import { OwnerPreparingDto } from './dtos/owner-preparing.dto';
// import { plainToInstance } from 'class-transformer';
// import { Order } from '../../entities/order.entity';

// @ApiTags('Orders')
// @Controller('orders')
// export class OrdersController {
//   private readonly logger = new Logger(OrdersController.name);

//   constructor(private readonly ordersService: OrdersService) {}

//   // Helper to extract UUID from req.user (works with different JWT shapes)
//   private getUserIdFromReq(req: any): string {
//     return req.user?.userId ?? req.user?.sub ?? req.user?.id;
//   }

//   private mapOrderToDto(order: Order): OrderResponseDto {
//     return plainToInstance(OrderResponseDto, {
//       id: order.id,
//       customer_id: order.customer_id,
//       restaurant_id: order.restaurant_id,
//       status: order.status,
//       payment_status: order.payment_status,
//       total_amount: Number(order.total_amount),
//       currency: order.currency,
//       instructions: order.instructions ?? undefined,
//       is_delivery: !!order.is_delivery,
//       payment_reference: order.payment_reference ?? undefined,
//       paid_at: order.paid_at ?? undefined,
//       items: (order.items || []).map(i => ({
//         id: i.id,
//         order_id: i.order_id,
//         menu_item_id: i.menu_item_id,
//         name: i.name,
//         unit_price: Number(i.unit_price),
//         quantity: i.quantity,
//         subtotal: Number(i.subtotal),
//         instructions: i.instructions ?? undefined,
//       })),
//       created_at: order.created_at,
//       updated_at: order.updated_at,
//     });
//   }

//   @UseGuards(JwtAuthGuard)
//   @ApiBearerAuth('access-token')
//   @Post()
//   @ApiOperation({ summary: 'Create a new order' })
//   @ApiBody({ type: CreateOrderDto })
//   @ApiResponse({ status: 201, description: 'Order created', type: OrderResponseDto })
//   async create(@Req() req: any, @Body() dto: CreateOrderDto): Promise<OrderResponseDto> {
//     const userId = this.getUserIdFromReq(req);
//     const order = await this.ordersService.createOrder(userId, dto);
//     return this.mapOrderToDto(order);
//   }

//   @UseGuards(JwtAuthGuard)
//   @ApiBearerAuth('access-token')
//   @Post(':id/owner-response')
//   @ApiOperation({ summary: 'Restaurant owner accepts or declines an order' })
//   @ApiBody({ type: OwnerResponseDto })
//   async ownerResponse(
//     @Req() req: any,
//     @Param('id') id: string,
//     @Body() body: OwnerResponseDto,
//   ) {
//     const ownerId = this.getUserIdFromReq(req);
//     return this.ordersService.ownerResponse(ownerId, id, body.accepted, body.reason);
//   }

//   @UseGuards(JwtAuthGuard)
//   @ApiBearerAuth('access-token')
//   @Post(':id/coming')
//   @ApiOperation({ summary: 'Customer marks that they are coming for pickup' })
//   @ApiBody({ type: ComingDto, required: false })
//   async coming(@Req() req: any, @Param('id') id: string, @Body() body?: ComingDto) {
//     const userId = this.getUserIdFromReq(req);
//     return this.ordersService.markCustomerComing(userId, id, body?.note);
//   }

//   @UseGuards(JwtAuthGuard)
//   @ApiBearerAuth('access-token')
//   @Get(':id')
//   @ApiOperation({ summary: 'Get order by id (customer or restaurant owner only)' })
//   @ApiResponse({ status: 200, type: OrderResponseDto })
//   async getOrder(@Req() req: any, @Param('id') id: string): Promise<OrderResponseDto> {
//     const userId = this.getUserIdFromReq(req);
//     const order = await this.ordersService.getOrderById(id);

//     // allow customer
//     if (order.customer_id === userId) return this.mapOrderToDto(order);

//     // allow restaurant owner
//     if (order.restaurant && order.restaurant.owner_id === userId) return this.mapOrderToDto(order);

//     // else deny
//     throw new Error('Forbidden');
//   }

//   /**
//    * Owner endpoint: toggle a menu item's availability
//    * PATCH /orders/restaurants/:rid/menu/:mid/availability
//    */
//   @UseGuards(JwtAuthGuard)
//   @ApiBearerAuth('access-token')
//   @Patch('/restaurants/:rid/menu/:mid/availability')
//   @ApiOperation({ summary: "Owner toggles a menu item's availability" })
//   @ApiParam({ name: 'rid', description: 'Restaurant id' })
//   @ApiParam({ name: 'mid', description: 'Menu item id' })
//   @ApiBody({ type: ToggleAvailabilityDto })
//   async toggleAvailability(
//     @Req() req: any,
//     @Param('rid') restaurantId: string,
//     @Param('mid') menuItemId: string,
//     @Body() body: ToggleAvailabilityDto,
//   ) {
//     const ownerId = this.getUserIdFromReq(req);
//     return this.ordersService.toggleMenuAvailability(ownerId, restaurantId, menuItemId, body.is_available);
//   }

// @UseGuards(JwtAuthGuard)
// @ApiBearerAuth('access-token')
// @Patch(':id/preparing')
// @ApiOperation({ summary: "Owner marks an order as 'preparing' (only after payment)" })
// @ApiParam({ name: 'id', description: 'Order id' })
// @ApiBody({ type: OwnerPreparingDto, required: false })
// async markPreparing(
// @Req() req: any,
// @Param('id', new ParseUUIDPipe()) id: string,
// @Body() body?: OwnerPreparingDto,
// ) {
// const ownerId = this.getUserIdFromReq(req);
// return this.ordersService.markOrderPreparing(ownerId, id, body?.note);
// }


// @UseGuards(JwtAuthGuard)
// @ApiBearerAuth('access-token')
// @Post(':id/cancel')
// @ApiOperation({ summary: 'Customer cancels their order (if allowed by status/payment)' })
// @ApiParam({ name: 'id', description: 'Order id' })
// @ApiBody({ type: CancelOrderDto, required: false })
// async cancelOrder(
// @Req() req: any,
// @Param('id', new ParseUUIDPipe()) id: string,
// @Body() body?: CancelOrderDto,
// ) {
// const customerId = this.getUserIdFromReq(req);
// return this.ordersService.cancelOrder(customerId, id, body?.reason);
// }

//   @UseGuards(JwtAuthGuard)
//   @ApiBearerAuth('access-token')
//   @Get()
//   @ApiOperation({ summary: 'List orders for the authenticated customer' })
//   @ApiQuery({ name: 'limit', required: false, type: Number })
//   @ApiQuery({ name: 'offset', required: false, type: Number })
//   @ApiResponse({ status: 200, type: OrderResponseDto, isArray: true })
//   async listCustomerOrders(
//     @Req() req: any,
//     @Query('limit') limit?: string,
//     @Query('offset') offset?: string,
//   ): Promise<OrderResponseDto[]> {
//     const userId = this.getUserIdFromReq(req);
//     const l = limit ? Math.min(Number(limit), 100) : 50;
//     const o = offset ? Math.max(Number(offset), 0) : 0;

//     const orders = await this.ordersService.getOrdersByCustomer(userId, l, o);
//     return orders.map((o) => this.mapOrderToDto(o));
//   }

// @UseGuards(JwtAuthGuard)
// @ApiBearerAuth('access-token')
// @Get('/restaurants')
// @ApiOperation({ summary: "List orders for the restaurant (restaurant id is taken from the JWT)" })
// @ApiQuery({ name: 'limit', required: false, type: Number })
// @ApiQuery({ name: 'offset', required: false, type: Number })
// @ApiResponse({ status: 200, type: OrderResponseDto, isArray: true })
// async listRestaurantOrdersByJwt(
//   @Req() req: any,
//   @Query('limit') limit?: string,
//   @Query('offset') offset?: string,
// ): Promise<OrderResponseDto[]> {
//   // Extract user info produced by JwtStrategy.validate()
//   const ownerId = this.getUserIdFromReq(req);
//   const restaurantId: string | null = req.user?.restaurantId ?? null;

//   if (!restaurantId) {
//     // No restaurant id in token — deny (or you could return [] instead)
//     throw new Error('Restaurant id missing from token');
//   }

//   const l = limit ? Math.min(Number(limit), 100) : 50;
//   const o = offset ? Math.max(Number(offset), 0) : 0;

//   const orders = await this.ordersService.getOrdersByRestaurant(ownerId, restaurantId, l, o);
//   return orders.map((o) => this.mapOrderToDto(o));
// }

//   /** Microservice event handlers (Kafka) — payment results. Using EventPattern for fire-and-forget events. */

//   @EventPattern('payment.success')
//   async onPaymentSuccess(@Payload() payload: any) {
//     this.logger.log(`Received payment.success event: ${JSON.stringify(payload)}`);
//     return this.ordersService.handlePaymentResult(payload);
//   }

//   @EventPattern('payment.failed')
//   async onPaymentFailed(@Payload() payload: any) {
//     this.logger.log(`Received payment.failed event: ${JSON.stringify(payload)}`);
//     return this.ordersService.handlePaymentResult(payload);
//   }
// }


import {
  Controller,
  Post,
  Body,
  UseGuards,
  Req,
  Param,
  Get,
  Patch,
  Logger,
  ParseUUIDPipe,
  Query,
  BadRequestException,
  ForbiddenException,
  UnauthorizedException,
} from '@nestjs/common';
import { OrdersService } from './order.service';
import { CreateOrderDto } from './dtos/create-order.dto';
import { OwnerResponseDto } from './dtos/owner-response.dto';
import { ComingDto } from './dtos/coming.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
  ApiBody,
  ApiParam,
  ApiQuery,
} from '@nestjs/swagger';
import { EventPattern, Payload } from '@nestjs/microservices';
import { ToggleAvailabilityDto } from './dtos/toggle-availability.dto';
import { OrderResponseDto } from './dtos/order-response.dto';
import { CancelOrderDto } from './dtos/cancel-order.dto';
import { OwnerPreparingDto } from './dtos/owner-preparing.dto';
import { plainToInstance } from 'class-transformer';
import { Order } from '../../entities/order.entity';

@ApiTags('Orders')
@Controller('orders')
export class OrdersController {
  private readonly logger = new Logger(OrdersController.name);

  constructor(private readonly ordersService: OrdersService) {}

  // Helper to extract UUID from req.user (works with different JWT shapes)
  private getUserIdFromReq(req: any): string {
    return req.user?.userId ?? req.user?.sub ?? req.user?.id;
  }

  private mapOrderToDto(order: Order): OrderResponseDto {
    return plainToInstance(OrderResponseDto, {
      id: order.id,
      customer_id: order.customer_id,
      restaurant_id: order.restaurant_id,
      status: order.status,
      payment_status: order.payment_status,
      total_amount: Number(order.total_amount),
      currency: order.currency,
      instructions: order.instructions ?? undefined,
      is_delivery: !!order.is_delivery,
      payment_reference: order.payment_reference ?? undefined,
      paid_at: order.paid_at ?? undefined,
      items: (order.items || []).map(i => ({
        id: i.id,
        order_id: i.order_id,
        menu_item_id: i.menu_item_id,
        name: i.name,
        unit_price: Number(i.unit_price),
        quantity: i.quantity,
        subtotal: Number(i.subtotal),
        instructions: i.instructions ?? undefined,
      })),
      created_at: order.created_at,
      updated_at: order.updated_at,
    });
  }

  // -----------------------
  // Orders creation + actions
  // -----------------------

  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('access-token')
  @Post()
  @ApiOperation({ summary: 'Create a new order for customers' })
  @ApiBody({ type: CreateOrderDto })
  @ApiResponse({ status: 201, description: 'Order created', type: OrderResponseDto })
  async create(@Req() req: any, @Body() dto: CreateOrderDto): Promise<OrderResponseDto> {
    const userId = this.getUserIdFromReq(req);
    const order = await this.ordersService.createOrder(userId, dto);
    return this.mapOrderToDto(order);
  }

  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('access-token')
  @Post(':id/owner-response')
  @ApiOperation({ summary: 'Restaurant owner accepts or declines an order (restaurant_owner only).' })
  @ApiParam({ name: 'id', description: 'Order id' })
  @ApiBody({ type: OwnerResponseDto })
  async ownerResponse(
    @Req() req: any,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() body: OwnerResponseDto,
  ) {
    const ownerId = this.getUserIdFromReq(req);
    return this.ordersService.ownerResponse(ownerId, id, body.accepted, body.reason);
  }

  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('access-token')
  @Post(':id/coming')
  @ApiOperation({ summary: 'Customer marks that they are coming for pickup' })
  @ApiParam({ name: 'id', description: 'Order id' })
  @ApiBody({ type: ComingDto, required: false })
  async coming(@Req() req: any, @Param('id', new ParseUUIDPipe()) id: string, @Body() body?: ComingDto) {
    const userId = this.getUserIdFromReq(req);
    return this.ordersService.markCustomerComing(userId, id, body?.note);
  }

  // -----------------------
  // Owner endpoints (static paths)
  // -----------------------

  /**
   * Owner endpoint: toggle a menu item's availability
   * PATCH /orders/restaurants/:rid/menu/:mid/availability
   */
  // @UseGuards(JwtAuthGuard)
  // @ApiBearerAuth('access-token')
  // @Patch('/restaurants/:rid/menu/:mid/availability')
  // @ApiOperation({ summary: "Owner toggles a menu item's availability (restaurant owner only)." })
  // @ApiParam({ name: 'rid', description: 'Restaurant id' })
  // @ApiParam({ name: 'mid', description: 'Menu item id' })
  // @ApiBody({ type: ToggleAvailabilityDto })
  // async toggleAvailability(
  //   @Req() req: any,
  //   @Param('rid', new ParseUUIDPipe()) restaurantId: string,
  //   @Param('mid', new ParseUUIDPipe()) menuItemId: string,
  //   @Body() body: ToggleAvailabilityDto,
  // ) {
  //   const ownerId = this.getUserIdFromReq(req);
  //   return this.ordersService.toggleMenuAvailability(ownerId, restaurantId, menuItemId, body.is_available);
  // }

  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('access-token')
  @Patch('/restaurants/menu/:mid/availability')
  @ApiOperation({ summary: "Owner toggles a menu item's availability (restaurant id from JWT for restaurant owners.)" })
  @ApiParam({ name: 'mid', description: 'Menu item id' })
  @ApiBody({ type: ToggleAvailabilityDto })
  async toggleAvailability(
    @Req() req: any,
    @Param('mid', new ParseUUIDPipe()) menuItemId: string,
    @Body() body: ToggleAvailabilityDto,
  ) {
    const ownerId = this.getUserIdFromReq(req);
    const restaurantId: string | null = req.user?.restaurantId ?? null;

    if (!restaurantId) {
      throw new BadRequestException('Restaurant id missing from token');
    }

    return this.ordersService.toggleMenuAvailability(ownerId, restaurantId, menuItemId, body.is_available);
  }


  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('access-token')
  @Patch(':id/preparing')
  @ApiOperation({ summary: "Owner marks an order as 'preparing' (only after payment) restaurant owner only)." })
  @ApiParam({ name: 'id', description: 'Order id' })
  @ApiBody({ type: OwnerPreparingDto, required: false })
  async markPreparing(
    @Req() req: any,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() body?: OwnerPreparingDto,
  ) {
    const ownerId = this.getUserIdFromReq(req);
    return this.ordersService.markOrderPreparing(ownerId, id, body?.note);
  }

  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('access-token')
  @Post(':id/cancel')
  @ApiOperation({ summary: 'Customer cancels their order (if allowed by status/payment) for customers.' })
  @ApiParam({ name: 'id', description: 'Order id' })
  @ApiBody({ type: CancelOrderDto, required: false })
  async cancelOrder(
    @Req() req: any,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() body?: CancelOrderDto,
  ) {
    const customerId = this.getUserIdFromReq(req);
    return this.ordersService.cancelOrder(customerId, id, body?.reason);
  }

  // -----------------------
  // Listing endpoints
  // -----------------------

  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('access-token')
  @Get()
  @ApiOperation({ summary: 'List orders for the authenticated customer' })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  @ApiQuery({ name: 'offset', required: false, type: Number })
  @ApiResponse({ status: 200, type: OrderResponseDto, isArray: true })
  async listCustomerOrders(
    @Req() req: any,
    @Query('limit') limit?: string,
    @Query('offset') offset?: string,
  ): Promise<OrderResponseDto[]> {
    const userId = this.getUserIdFromReq(req);
    const l = limit ? Math.min(Number(limit), 100) : 50;
    const o = offset ? Math.max(Number(offset), 0) : 0;

    const orders = await this.ordersService.getOrdersByCustomer(userId, l, o);
    return orders.map((o) => this.mapOrderToDto(o));
  }

  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('access-token')
  @Get('/restaurants')
  @ApiOperation({ summary: "List orders for the restaurant (restaurant id is taken from the JWT)" })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  @ApiQuery({ name: 'offset', required: false, type: Number })
  @ApiResponse({ status: 200, type: OrderResponseDto, isArray: true })
  async listRestaurantOrdersByJwt(
    @Req() req: any,
    @Query('limit') limit?: string,
    @Query('offset') offset?: string,
  ): Promise<OrderResponseDto[]> {
    const ownerId = this.getUserIdFromReq(req);
    const restaurantId: string | null = req.user?.restaurantId ?? null;

    if (!restaurantId) {
      throw new BadRequestException('Restaurant id missing from token');
    }

    const l = limit ? Math.min(Number(limit), 100) : 50;
    const o = offset ? Math.max(Number(offset), 0) : 0;

    const orders = await this.ordersService.getOrdersByRestaurant(ownerId, restaurantId, l, o);
    return orders.map((o) => this.mapOrderToDto(o));
  }

  // -----------------------
  // Single order (dynamic route) — placed AFTER static routes to avoid collisions
  // -----------------------
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('access-token')
  @Get(':id')
  @ApiOperation({ summary: 'Get order by id (customer or restaurant owner only)' })
  @ApiParam({ name: 'id', description: 'Order id' })
  @ApiResponse({ status: 200, type: OrderResponseDto })
  async getOrder(@Req() req: any, @Param('id', new ParseUUIDPipe()) id: string): Promise<OrderResponseDto> {
    const userId = this.getUserIdFromReq(req);
    const order = await this.ordersService.getOrderById(id);

    // allow customer
    if (order.customer_id === userId) return this.mapOrderToDto(order);

    // allow restaurant owner
    if (order.restaurant && order.restaurant.owner_id === userId) return this.mapOrderToDto(order);

    // else deny
    throw new ForbiddenException('Forbidden');
  }

  /** Microservice event handlers (Kafka) — payment results. Using EventPattern for fire-and-forget events. */

  @EventPattern('payment.success')
  async onPaymentSuccess(@Payload() payload: any) {
    this.logger.log(`Received payment.success event: ${JSON.stringify(payload)}`);
    return this.ordersService.handlePaymentResult(payload);
  }

  @EventPattern('payment.failed')
  async onPaymentFailed(@Payload() payload: any) {
    this.logger.log(`Received payment.failed event: ${JSON.stringify(payload)}`);
    return this.ordersService.handlePaymentResult(payload);
  }
}
