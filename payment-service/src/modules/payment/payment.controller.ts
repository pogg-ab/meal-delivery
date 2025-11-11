import { Controller, Post, Body, Headers, Req, Get, Param, UnauthorizedException, UseGuards, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiBody, ApiHeader, ApiOkResponse, ApiOperation, ApiParam, ApiResponse } from '@nestjs/swagger';
import { CreateSubaccountDto } from './dtos/create-subaccount.dto';
import { RefundDto } from './dtos/refund.dto';
// import { PlatformAccountResponseDto } from './dtos/platform-account-response.dto';
// import { PaymentInitiateDto } from './dtos/payment-initiate.dto';
// import { PaymentInitiatedResponseDto } from './dtos/payment-initiated-response.dto';
import { PayoutQueueService } from './payout-queue.service';
import { CreateAggregatedBatchDto } from './dtos/create-aggregated-batch.dto';
import { ProcessBatchDto } from './dtos/process-batch.dto';
import { EventPattern, Payload } from '@nestjs/microservices';
import { PaymentsService } from './payment.service';
import { Roles } from 'src/roles.decorator';
import { JwtAuthGuard } from 'src/common/guards/jwt-auth.guard';
import { RolesGuard } from 'src/roles.guard';
import { FindSubaccountsDto } from './dtos/findAll-subaccount.dto';
@Controller()
export class PaymentsController {
constructor(
  private readonly svc: PaymentsService,
  private readonly payoutQueue: PayoutQueueService
) {}


@Post('/webhook/chapa')
@ApiOperation({ summary: 'Chapa webhook endpoint (server-to-server). Provide raw JSON body and X-Chapa-Signature header.' })
@ApiHeader({ name: 'x-chapa-signature', description: 'HMAC SHA256 signature' })
async chapaWebhook(@Req() req: any, @Headers('x-chapa-signature') signature?: string) {
const raw = req.rawBody as Buffer;
console.log(raw, signature);
await this.svc.handleChapaWebhook(raw, signature);
return { ok: true };
}

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

@Get('/restaurant-subaccounts')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('platform_admin')
@ApiOperation({ summary: 'List restaurant subaccounts (supports pagination and filtering)' })
@ApiOkResponse({ description: 'Returns a paginated list of restaurant subaccounts' })
async findAll(@Query() query: FindSubaccountsDto) {
return this.svc.findAll(query);
}


// GET platform account
@Get('/internal/payments/platform/subaccount')
@UseGuards(JwtAuthGuard, RolesGuard)
@ApiBearerAuth('access-token')
@Roles('platform_admin')
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


@Post('aggregated-batches')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('platform_admin')
@ApiBearerAuth('access-token')
@ApiOperation({ summary: 'Create aggregated batch (admin). Optionally auto-process.' })
async createAggregatedBatch(@Req() req: any, @Body() dto: CreateAggregatedBatchDto) {
  const createdBy = req.user?.userId;
  const result = await this.svc.createAggregatedBatch({
    olderThan: dto.olderThan ? new Date(dto.olderThan) : undefined,
    restaurantIds: dto.restaurantIds ?? [],
    minTotal: dto.minTotal ?? undefined,
    createdBy,
    autoProcess: dto.autoProcess ?? false,
  });

  const { batch, details } = result;

  if (dto.autoProcess) {
    const job = await this.payoutQueue.addProcessBatchJob({ batchId: batch.id, requestedBy: createdBy, requestId: undefined });
    return { batch, enqueued: true, jobId: job.id, details };
  }

  return { batch, details };
}

@Post('aggregated-batches/:id/process')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('platform_admin')
@ApiBearerAuth('access-token')
@ApiOperation({ summary: 'Trigger processing of an existing batch (enqueue or sync)' })
async processBatch(@Req() req: any, @Param('id') id: string, @Body() dto: ProcessBatchDto) {
const requestedBy = req.user?.userId ?? 'unknown';
if (dto?.sync) {
// synchronous processing (admin debug only)
const result = await this.svc.processAggregatedBatch(id, { requestedBy, force: dto.force ?? false });
return { status: 'done', batch: result };
}

const job = await this.payoutQueue.addProcessBatchJob({ batchId: id, requestedBy, requestId: undefined });
return { status: 'enqueued', jobId: job.id, batchId: id };
}


}