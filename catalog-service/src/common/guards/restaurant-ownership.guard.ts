// src/common/guards/restaurant-ownership.guard.ts

import {
  CanActivate,
  ExecutionContext,
  Injectable,
  ForbiddenException,
  Logger,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Restaurant } from '../../entities/restaurant.entity';
import { Repository } from 'typeorm';

@Injectable()
export class RestaurantOwnershipGuard implements CanActivate {
  private readonly logger = new Logger(RestaurantOwnershipGuard.name);

  constructor(
    @InjectRepository(Restaurant)
    private readonly restaurantRepository: Repository<Restaurant>,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const user = request.user;
    const restaurantId = request.params.restaurantId;

    if (!user || !restaurantId) {
      this.logger.warn('User or restaurantId missing from request.');
      return false;
    }

    const restaurant = await this.restaurantRepository.findOneBy({
      id: restaurantId,
    });

    if (!restaurant) {
      // Restaurant not found, but we throw Forbidden to not leak information.
      throw new ForbiddenException('Access denied.');
    }

   if (restaurant.owner_id !== user.id) {
      this.logger.warn(
        `Ownership check failed. User ${user.id} tried to access restaurant ${restaurantId} owned by ${restaurant.owner_id}.`,
      );
      throw new ForbiddenException('You do not have permission to access this resource.');
    }

    return true; // User is the owner, allow access.
  }
}