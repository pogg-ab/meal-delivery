import { Controller } from '@nestjs/common';
import { EventPattern, Payload } from '@nestjs/microservices';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Restaurant } from '../../entities/restaurant.entity';

interface RestaurantEventPayload {
  id: string;
  name: string;
  owner_id: string;
  is_active: boolean;
}

@Controller()
export class RestaurantsConsumer {
  constructor(
    @InjectRepository(Restaurant)
    private readonly restaurantRepository: Repository<Restaurant>,
  ) {}

  // Listen for both approved and updated events
  @EventPattern('restaurant.approved')
  @EventPattern('restaurant.profile.updated')
  async handleRestaurantUpdate(@Payload() data: RestaurantEventPayload) {
    console.log(`Received event on topic restaurant.approved/updated for restaurant ID: ${data.id}`);
    
    const restaurant = this.restaurantRepository.create({
      id: data.id,
      name: data.name,
      owner_id: data.owner_id,
      is_active: data.is_active,
    });

    // .save() will INSERT if new, or UPDATE if ID exists.
    await this.restaurantRepository.save(restaurant);
    console.log(`Successfully saved restaurant ${data.id} to catalog-db.`);
  }
}