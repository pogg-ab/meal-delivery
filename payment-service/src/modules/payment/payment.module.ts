import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ClientsModule, Transport } from '@nestjs/microservices';
import { PaymentsController } from './payment.controller';
import { PaymentsService } from './payment.service';
import { ChapaService } from './chapa.service';
import { Payment } from '../../entities/payment.entity';
import { RestaurantSubaccount } from '../../entities/restaurant-subaccount.entity';
import { PlatformAccount } from 'src/entities/platform-account.entity';
import { KafkaProvider } from '../../providers/kafka.provider';
import { JwtStrategy } from 'src/common/strategies/jwt.strategy';
import { PayoutBatch } from 'src/entities/payout-batch.entity';
// import { PayoutItem } from 'src/entities/payout-item.entity';
import { PayoutChild } from 'src/entities/payout-children.entity';
import { AggregatedPayout } from 'src/entities/aggregated-payout.entity';
import { HttpModule } from '@nestjs/axios';


@Module({
imports: [
    TypeOrmModule.forFeature([Payment, RestaurantSubaccount, PlatformAccount, PayoutBatch, PayoutChild, AggregatedPayout ]),
    
],
controllers: [PaymentsController],
providers: [PaymentsService, JwtStrategy, ChapaService, KafkaProvider],
exports: [PaymentsService],
})
export class PaymentsModule {}