
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
  NotFoundException,
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
import { OrdersPickupService } from './order-pickup.service';
import { VerifyPickupDto } from './dtos/verify-pickup.dto';
import { RolesGuard } from 'src/common/guards/roles.guard';
import { Roles } from 'src/common/decorator/roles.decorator';

@ApiTags('Orders')
@Controller('orders')
export class OrdersController {
  private readonly logger = new Logger(OrdersController.name);

  constructor(
    private readonly ordersService: OrdersService,
    private readonly pickupService: OrdersPickupService,
  ) {}

  // Helper to extract UUID from req.user (works with different JWT shapes)
  private getUserIdFromReq(req: any): string {
    return req.user?.userId;
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
    console.log(req.user);
    const username = req.user?.username;
    const phone = req.user?.phone;
    console.log(username);
    const order = await this.ordersService.createOrder(userId, username, phone, dto);
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

  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('access-token')
  @Get(':id/payment')
  @ApiOperation({ summary: 'Customer: get payment info (checkout url & status) for their order' })
  @ApiParam({ name: 'id', description: 'Order id (uuid)' })
  @ApiResponse({
    status: 200,
    description: 'Returns payment info for the order (primitives only).',
    schema: {
      example: {
        tx_ref: 'order-96a88900-mghx039l',
        checkout_url: 'https://checkout.chapa.io/checkout/abcd1234',
        payment_expires_at: '2025-10-16T15:30:00.000Z',
        payment_status: 'INITIATED'
      }
    }
  })
  async getPaymentForOrder(
    @Req() req: any,
    @Param('id', new ParseUUIDPipe()) orderId: string,
  ): Promise<{ tx_ref?: string; checkout_url?: string; payment_expires_at?: Date | string; payment_status?: string }> {
    const userId = this.getUserIdFromReq(req);
    const order = await this.ordersService.getOrderById(orderId);
    if (!order) {
      throw new ForbiddenException('Order not found or not accessible');
    }

    // allow only the customer who placed the order
    if (order.customer_id !== userId) {
      throw new ForbiddenException('Not allowed to view payment for this order');
    }

    // Pick a small set of safe, primitive fields to return.
    const tx_ref = (order as any).tx_ref ?? (order as any).payment_tx_ref ?? (order as any).payment_reference ?? undefined;
    const checkout_url = (order as any).checkout_url ?? (order as any).payment_checkout_url ?? undefined;
    const payment_expires_at = (order as any).payment_expires_at ?? (order as any).payment_expires_at ?? undefined;
    const payment_status = String(order.payment_status ?? '').toUpperCase() ?? undefined;

    return {
      tx_ref,
      checkout_url,
      payment_expires_at,
      payment_status,
    };
  }


@UseGuards(JwtAuthGuard)
@ApiBearerAuth('access-token')
@Get(':id/pickup')
@ApiOperation({ summary: 'Customer: get or issue pickup code/token for their order' })
@ApiParam({ name: 'id', description: 'Order id (uuid)' })
@ApiResponse({
  status: 200,
  description: 'Returns pickup token, plaintext pickup code (for customer) and expiry.',
  schema: {
    example: {
      pickup_token: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...',
      pickup_code: '012345',
      expires_at: '2025-10-14T15:30:00.000Z',
    },
  },
})

async getPickupForCustomer(
  @Req() req: any,
  @Param('id', new ParseUUIDPipe()) orderId: string,
): Promise<{ pickup_token?: string; pickup_code?: string; expires_at?: Date }> {
  
  const userId = this.getUserIdFromReq(req);
  const order = await this.ordersService.getOrderById(orderId); // assumes this method exists and returns Order with customer_id
  if (!order) {
    throw new ForbiddenException('Order not found or not accessible');
  }

  if (order.customer_id !== userId) {
    throw new ForbiddenException('Not allowed to view pickup for this order');
  }
  const pickup = await this.pickupService.getOrIssuePickupForCustomer(orderId, userId);

  // Return only safe primitives to the customer
  return {
    pickup_token: pickup.pickup_token ?? undefined,
    pickup_code: pickup.pickup_code ?? undefined,
    expires_at: pickup.expires_at ?? undefined,
  };
}

// OrdersController (excerpt)
@Post(':id/pickup/verify')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('restaurant_owner')
@ApiBearerAuth('access-token')
@ApiOperation({ summary: 'Verify pickup by code or token (restaurant owner/staff)' })
@ApiParam({ name: 'id', description: 'Order id (uuid)' })
@ApiBody({ type: VerifyPickupDto })
@ApiResponse({ status: 200, description: 'Pickup verified' })
async verifyPickup(
  @Req() req: any,
  @Param('id', new ParseUUIDPipe()) orderId: string,
  @Body() dto: VerifyPickupDto,
) {
  // actor id (user performing verification)
  const actorId: string = req.user?.userId ?? req.user?.sub ?? req.user?.id;
  const actorRestaurantId: string | undefined = req.user?.restaurantId;

  if (!actorRestaurantId) {
    throw new ForbiddenException('No restaurant id in token; only restaurant owners can verify');
  }

  this.logger.log(`verifyPickup called by ${actorId} (restaurant ${actorRestaurantId}) for order ${orderId}`);

  // Service now requires actorRestaurantId to validate ownership
  const result = await this.pickupService.verifyPickupAsOwner(orderId, actorId, actorRestaurantId, {
    code: dto.code,
    token: dto.token,
  });

  // normalized response for the caller (restaurant UI)
  return {
    ok: true,
    pickup: {
      id: result.id,
      order_id: result.order_id,
      pickup_token: result.pickup_token ?? null,
      expires_at: result.expires_at,
      verified: result.verified,
      verified_by: result.verified_by,
      verified_at: result.verified_at,
    },
    order: {
      id: result.order.id,
      customer_name: result.order.customer_name ?? result.order.customer_id, // fallback
      customer_phone: result.order.customer_phone ?? null,
      items: (result.order.items || []).map((it: any) => ({
        id: it.id,
        name: it.name,
        quantity: it.quantity,
        unit_price: Number(it.unit_price),
        subtotal: Number(it.subtotal),
      })),
      total_amount: Number(result.order.total_amount ?? 0),
      currency: result.order.currency ?? null,
    },
  };
}



  /** Microservice event handlers (Kafka) — payment results. Using EventPattern for fire-and-forget events. */

    @EventPattern('payment.initiated')
    async onPaymentInitiated(@Payload() payload: any) {
      try {
       this.ordersService.handlePaymentInitiated(payload);
      } catch (e) {
    // log and swallow — consumer should not crash
      console.error('Failed handling payment.initiated', e);
      }
   }

  @EventPattern('payment.success')
  async onPaymentSuccess(@Payload() payload: any) {
    console.log(payload);
    this.logger.log(`Received payment.success event: ${JSON.stringify(payload)}`);
    return this.ordersService.handlePaymentResult(payload);
  }

  @EventPattern('payment.failed')
  async onPaymentFailed(@Payload() payload: any) {
    this.logger.log(`Received payment.failed event: ${JSON.stringify(payload)}`);
    return this.ordersService.handlePaymentResult(payload);
  }
}
