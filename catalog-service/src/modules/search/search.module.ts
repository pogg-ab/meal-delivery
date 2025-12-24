import { Module } from '@nestjs/common';
import { SearchController } from './search.controller';
import { SearchService } from './search.service';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Restaurant } from 'src/entities/restaurant.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([Restaurant])
  ],
  controllers: [SearchController],
  providers: [SearchService]
})
export class SearchModule {}