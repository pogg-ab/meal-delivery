// src/modules/promos/promos.module.ts
import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { PromoCode } from '../../entities/promo-code.entity';
import { PromoCodeService } from './promo.service';
import { PromoCodesController } from './promo.controller';

@Module({
  imports: [TypeOrmModule.forFeature([PromoCode])],
  controllers: [PromoCodesController],
  providers: [PromoCodeService],
  exports: [PromoCodeService],
})
export class PromosModule {}
