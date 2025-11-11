import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { MenuPersonalizationService } from './menu-personalization.service';
import { MenuPersonalizationController } from './menu-personalization.controller';
import { CustomerMenuRanking } from '../../entities/customer-menu-ranking.entity';
import { MenuItem } from '../../entities/menu-item.entity';

@Module({
  imports: [TypeOrmModule.forFeature([CustomerMenuRanking, MenuItem])],
  providers: [MenuPersonalizationService],
  controllers: [MenuPersonalizationController],
  exports: [MenuPersonalizationService],
})
export class MenuPersonalizationModule {}
