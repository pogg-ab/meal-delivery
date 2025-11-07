import { Controller } from '@nestjs/common';
import { EventPattern, Payload } from '@nestjs/microservices';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Restaurant } from '../../entities/restaurant.entity';

// --- MODIFIED ---
// We create a dedicated interface for the address part of the payload.
interface AddressPayload {
  street: string;
  city: string;
  region: string;
  country: string;
  latitude: number;
  longitude: number;
}

// --- MODIFIED ---
// The main payload interface is updated to include the new fields.
interface RestaurantEventPayload {
  id: string;
  name: string;
  description: string; // New field
  owner_id: string;
  is_active: boolean;
  address: AddressPayload | null; // New nested object
}

@Controller()
export class RestaurantsConsumer {
  constructor(
    @InjectRepository(Restaurant)
    private readonly restaurantRepository: Repository<Restaurant>,
  ) {}

  // This listener will now correctly handle the enriched payload
  @EventPattern('restaurant.approved')
  @EventPattern('restaurant.profile.updated') // Assuming profile updates will also send location
  async handleRestaurantUpdate(@Payload() data: RestaurantEventPayload) {
    console.log(`Received event on topic restaurant.approved/updated for restaurant ID: ${data.id}`);
    
    // --- MODIFIED ---
    // The create() method now maps all the new fields from the payload
    // to the corresponding columns in the restaurant entity.
    const restaurant = this.restaurantRepository.create({
      id: data.id,
      name: data.name,
      owner_id: data.owner_id,
      is_active: data.is_active,
      
      // Map new top-level fields
      description: data.description,

      // Flatten the nested address object from the payload into the entity's columns
      // We safely handle cases where the address might be null in the event.
      street: data.address ? data.address.street : null,
      city: data.address ? data.address.city : null,
      region: data.address ? data.address.region : null,
      country: data.address ? data.address.country : null,
      latitude: data.address ? data.address.latitude : null,
      longitude: data.address ? data.address.longitude : null,
    } as any);

    // .save() will INSERT a new restaurant or UPDATE an existing one based on the ID.
    await this.restaurantRepository.save(restaurant);
    console.log(`Successfully saved restaurant ${data.id} with location data to catalog-db.`);
  }
}