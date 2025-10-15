import { Controller, Post, Body, Headers, Req, Get, Param, UnauthorizedException, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiBody, ApiHeader, ApiOperation, ApiParam, ApiResponse } from '@nestjs/swagger';
import { CreateSubaccountDto } from './dtos/create-subaccount.dto';
import { RefundDto } from './dtos/refund.dto';
import { PlatformAccountResponseDto } from './dtos/platform-account-response.dto';
import { PaymentInitiateDto } from './dtos/payment-initiate.dto';
import { PaymentInitiatedResponseDto } from './dtos/payment-initiated-response.dto';
import { EventPattern, Payload } from '@nestjs/microservices';
import { PaymentsService } from './payment.service';
import { Roles } from 'src/roles.decorator';
import { JwtAuthGuard } from 'src/common/guards/jwt-auth.guard';
import { RolesGuard } from 'src/roles.guard';
@Controller()
export class PaymentsController {
constructor(private readonly svc: PaymentsService) {}


@Post('/webhook/chapa')
@ApiOperation({ summary: 'Chapa webhook endpoint (server-to-server). Provide raw JSON body and X-Chapa-Signature header.' })
@ApiHeader({ name: 'x-chapa-signature', description: 'HMAC SHA256 signature' })
async chapaWebhook(@Req() req: any, @Headers('x-chapa-signature') signature?: string) {
const raw = req.rawBody as Buffer;
console.log(raw, signature);
await this.svc.handleChapaWebhook(raw, signature);
return { ok: true };
}


// @Post('/internal/payments/create-subaccount')
// @ApiOperation({ summary: 'Create chapa subaccount for a restaurant (internal only)' })
// @ApiBody({ type: CreateSubaccountDto })
// async createSub(@Body() body: CreateSubaccountDto, @Headers('x-service-secret') secret?: string) {
// if (secret !== process.env.SERVICE_AUTH_SECRET) throw new UnauthorizedException();
// return this.svc.createSubaccountInternal(body);
// }

@Post('/internal/payments/restaurants/:rid/subaccount')
@Roles('platform_admin')
@UseGuards(JwtAuthGuard, RolesGuard)
@ApiBearerAuth('access-token')
@ApiOperation({ summary: 'Create chapa subaccount for a restaurant (internal only). Provide restaurant id as path param.' })
@ApiParam({ name: 'rid', description: 'Restaurant id (uuid)' })
@ApiBody({ type: CreateSubaccountDto })
async createSub(
@Param('rid') restaurantId: string,
@Body() body: CreateSubaccountDto,
@Headers('x-service-secret') secret?: string,
) {
if (secret !== process.env.SERVICE_AUTH_SECRET) throw new UnauthorizedException();
return this.svc.createSubaccountInternal(restaurantId, body);
}

@Get('/internal/payments/verify/:tx_ref')
@ApiOperation({ summary: 'Verify tx_ref via Chapa (internal)' })
@ApiParam({ name: 'tx_ref' })
async verify(@Param('tx_ref') tx_ref: string, @Headers('x-service-secret') secret?: string) {
if (secret !== process.env.SERVICE_AUTH_SECRET) throw new UnauthorizedException();
return this.svc.verifyTxRef(tx_ref);
}

@Post('/internal/payments/refund')
@ApiOperation({ summary: 'Refund a Chapa transaction (internal)' })
@ApiBody({ type: RefundDto })
async refund(@Body() body: RefundDto, @Headers('x-service-secret') secret?: string) {
if (secret !== process.env.SERVICE_AUTH_SECRET) throw new UnauthorizedException();
return this.svc.refund(body);
}

// @Post('/internal/payments/initiate')
// @ApiOperation({ summary: 'Simulate order.awaiting_payment (for testing via Swagger). Triggers payment initialization.' })
// @ApiBody({ type: PaymentInitiateDto })
// @ApiResponse({ status: 201, type: PaymentInitiatedResponseDto })
// async initiatePayment(@Body() dto: PaymentInitiateDto, @Headers('x-service-secret') secret?: string) {
// if (secret !== process.env.SERVICE_AUTH_SECRET) throw new UnauthorizedException();
// const result = await this.svc.handleOrderAwaitingPayment(dto);
// return { order_id: dto.order_id};
// }

@Post('/internal/payments/platform/subaccount')
@Roles('platform_admin')
@UseGuards(JwtAuthGuard, RolesGuard)
@ApiBearerAuth('access-token')
@ApiOperation({ summary: 'Create or update the platform chapa subaccount (internal only)' })
@ApiBody({ type: CreateSubaccountDto })
async createPlatformSub(
  @Body() body: CreateSubaccountDto,
  @Headers('x-service-secret') secret?: string,
) {
  if (secret !== process.env.SERVICE_AUTH_SECRET) throw new UnauthorizedException();
  return this.svc.createOrUpdatePlatformAccount(body);
}

// GET platform account
@Get('/internal/payments/platform/subaccount')
@Roles('platform_admin')
@UseGuards(JwtAuthGuard, RolesGuard)
@ApiOperation({ summary: 'Get current platform chapa subaccount (internal)' })
async getPlatformSub(@Headers('x-service-secret') secret?: string) {
  if (secret !== process.env.SERVICE_AUTH_SECRET) throw new UnauthorizedException();
  return this.svc.getPlatformAccount();
}


@EventPattern('order.awaiting_payment')
async onOrderAwaitingPayment(@Payload() payload: any) {
try {
await this.svc.handleOrderAwaitingPayment(payload);
console.log(payload);
} catch (e) {
console.error('Error handling order.awaiting_payment', e);
  }
 }
}