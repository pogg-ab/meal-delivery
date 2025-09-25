
import { Injectable, ConflictException, NotFoundException, UnauthorizedException, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { RegisterRestaurantDto } from './dto/register-restaurant.dto';

import { Restaurant, RestaurantStatus } from '../../entities/restaurant.entity';
import { Address } from '../../entities/address.entity';
import { RestaurantHour } from '../../entities/restaurant-hour.entity';
import { RestaurantDocument } from 'src/entities/restaurant-document.entity';
import { v4 as uuidv4 } from 'uuid';
import * as fs from 'fs';
import * as path from 'path';
import { UploadDocumentDto } from './dto/upload-document.dto';
import { AdminUpdateStatus, UpdateRestaurantStatusDto } from './dto/update-restaurant-status.dto';
import { RestaurantBankDetail } from 'src/entities/restaurant-bank-detail.entity';
import { UpdateRestaurantDto } from './dto/update-restaurant.dto';
import { KafkaProvider } from 'src/providers/kafka.provider';
import { UsersService } from '../UserModule/user.service';
import { RolesService } from '../RolesModule/roles.service';
import { MailerProvider } from 'src/providers/mailer.provider';

@Injectable()
export class RestaurantsService {
    constructor(
        private readonly usersService: UsersService,
        private readonly rolesService: RolesService,
        private readonly kafkaProvider: KafkaProvider,
        private readonly mailerProvider: MailerProvider,
        @InjectRepository(Restaurant)
        private readonly restaurantRepository: Repository<Restaurant>,
        @InjectRepository(Address)
        private readonly addressRepository: Repository<Address>,
        @InjectRepository(RestaurantHour)
        private readonly hourRepository: Repository<RestaurantHour>,
        @InjectRepository(RestaurantDocument)
        private readonly documentRepository: Repository<RestaurantDocument>,
        @InjectRepository(RestaurantBankDetail)
        private readonly bankDetailRepository: Repository<RestaurantBankDetail>,  
    ) {}

    async register(registerDto: RegisterRestaurantDto, ownerId: string): Promise<Restaurant> {
        const { name, description, email, phone, address, hours } = registerDto;

        // Check if a restaurant with the same name already exists
        const existing = await this.restaurantRepository.findOne({ where: { name } });
        if (existing) {
            throw new ConflictException(`Restaurant with name "${name}" already exists.`);
        }

        // Create the main restaurant entity
        const restaurant = this.restaurantRepository.create({
            name,
            description,
            email,
            phone,
            owner_id: ownerId,
            // status and is_active have default values from the entity definition
        });
        const savedRestaurant = await this.restaurantRepository.save(restaurant);

        // Create the associated address
        const newAddress = this.addressRepository.create({
            ...address,
            restaurant_id: savedRestaurant.id,
        });
        await this.addressRepository.save(newAddress);

        // Create the associated hours
        const hoursEntities = hours.map(hourDto => this.hourRepository.create({
            ...hourDto,
            restaurant_id: savedRestaurant.id,
        }));
        await this.hourRepository.save(hoursEntities);

        // Return the full restaurant object with its new relations
        const fullRestaurant = await this.restaurantRepository.findOne({
            where: { id: savedRestaurant.id },
            relations: ['addresses', 'hours'],
        });
        if (!fullRestaurant) {
            throw new NotFoundException(`Restaurant with id "${savedRestaurant.id}" not found after creation.`);
        }
        return fullRestaurant;
    }

    async addDocument(
  ownerId: string,
  restaurantId: string,
  uploadDto: UploadDocumentDto,
  file: Express.Multer.File,
): Promise<RestaurantDocument> {
  const restaurant = await this.restaurantRepository.findOneBy({ id: restaurantId });

  if (!restaurant) {
    throw new NotFoundException(`Restaurant with ID "${restaurantId}" not found.`);
  }
  if (restaurant.owner_id !== ownerId) {
    throw new UnauthorizedException('You are not the owner of this restaurant.');
  }

  // For now, we save the file locally. In production, this would be S3, etc.
  const filename = `${uuidv4()}${path.extname(file.originalname)}`;
  const uploadPath = './uploads/documents'; // Create this folder if it doesn't exist
  const filePath = path.join(uploadPath, filename);

  // Ensure the directory exists
  if (!fs.existsSync(uploadPath)) {
    fs.mkdirSync(uploadPath, { recursive: true });
  }

  // Save the file to disk
  fs.writeFileSync(filePath, file.buffer);

  // Create the database record
  const newDocument = this.documentRepository.create({
    restaurant_id: restaurantId,
    document_type: uploadDto.document_type,
    document_url: `/documents/${filename}`, // We'll serve this path later
  });
  const savedDocument = await this.documentRepository.save(newDocument);

  // As per requirements, trigger status update to UNDER_REVIEW
  restaurant.status = RestaurantStatus.UNDER_REVIEW;
  await this.restaurantRepository.save(restaurant);
  
  return savedDocument;
}

async updateStatus(
  restaurantId: string,
  updateStatusDto: UpdateRestaurantStatusDto,
): Promise<Restaurant> {
  const restaurant = await this.restaurantRepository.findOneBy({ id: restaurantId });

  if (!restaurant) {
    throw new NotFoundException(`Restaurant with ID "${restaurantId}" not found.`);
  }

  const { status, rejection_reason } = updateStatusDto;

  if (status === AdminUpdateStatus.REJECTED && !rejection_reason) {
    throw new BadRequestException('Rejection reason is required when rejecting a restaurant.');
  }

  restaurant.status = status as unknown as RestaurantStatus;
  
  restaurant.rejection_reason = rejection_reason || '';

  if (status === AdminUpdateStatus.APPROVED) {
    restaurant.is_active = true;

    const allRoles = await this.rolesService.findAll();
    const ownerRole = allRoles.find(role => role.name === 'restaurant_owner');

    if (!ownerRole) {
      throw new NotFoundException('"restaurant_owner" role not found. Please seed the database.');
    }

    // await this.usersService.assignRole(restaurant.owner_id, ownerRole.role_id);
    await this.usersService.assignRole(restaurant.owner_id, { roleId: ownerRole.role_id });


    this.kafkaProvider.emit('restaurant.approved', {
    id: restaurant.id,
    name: restaurant.name,
    owner_id: restaurant.owner_id,
    is_active: restaurant.is_active,
  });

    try {
      await this.mailerProvider.sendMail(
        restaurant.email, 
        `Congratulations! Your restaurant "${restaurant.name}" has been approved!`,
        `Your restaurant is now active and live on our platform. You can now log in to manage your menu and view orders.`,
        
        `<p>Congratulations! Your restaurant, <strong>${restaurant.name}</strong>, is now active and live on our platform.</p>`
      );
    } catch (error) {
      console.error('Failed to send approval email:', error);
    }

  } else { 
    restaurant.is_active = false;
   this.kafkaProvider.emit('restaurant.rejected', {
    id: restaurant.id, 
    owner_id: restaurant.owner_id, 
    name: restaurant.name, 
    rejection_reason: rejection_reason, 
  });
  }
  try {
      await this.mailerProvider.sendMail(
        restaurant.email,
        `Update on your restaurant "${restaurant.name}"`,
        `There was an update regarding your restaurant application. Reason: ${rejection_reason}`,
        `<p>There was an update regarding your application for <strong>${restaurant.name}</strong>.</p><p>Reason: ${rejection_reason}</p><p>Please contact support for more information.</p>`
      );
    } catch (error) {
      console.error('Failed to send rejection email:', error);
    }
  
  return this.restaurantRepository.save(restaurant);
}

async updateProfile(
  ownerId: string,
  restaurantId: string,
  updateDto: UpdateRestaurantDto,
): Promise<Restaurant> {
  const restaurant = await this.restaurantRepository.findOneBy({ id: restaurantId });

  if (!restaurant) {
    throw new NotFoundException(`Restaurant with ID "${restaurantId}" not found.`);
  }

  // --- CRITICAL AUTHORIZATION CHECK ---
  if (restaurant.owner_id !== ownerId) {
    throw new UnauthorizedException('You do not have permission to edit this restaurant.');
  }
  
  const { bank_details, ...restDetails } = updateDto;

  // Update bank details if provided
  if (bank_details) {
    let existingBankDetail = await this.bankDetailRepository.findOne({ where: { restaurant_id: restaurantId }});
    if (existingBankDetail) {
      Object.assign(existingBankDetail, bank_details);
      await this.bankDetailRepository.save(existingBankDetail);
    } else {
      const newBankDetail = this.bankDetailRepository.create({
        ...bank_details,
        restaurant_id: restaurantId,
      });
      await this.bankDetailRepository.save(newBankDetail);
    }
  }

  // Update the other restaurant details
  Object.assign(restaurant, restDetails);
  await this.restaurantRepository.save(restaurant);

  // Return the fully updated restaurant with relations
  const updatedRestaurant = await this.restaurantRepository.findOne({
    where: { id: restaurantId },
    relations: ['bank_details'],
  });
  if (!updatedRestaurant) {
    throw new NotFoundException(`Restaurant with id "${restaurantId}" not found after update.`);
  }
  return updatedRestaurant;
}

async findPendingReview(): Promise<Restaurant[]> {
  return this.restaurantRepository.find({
    where: {
      status: RestaurantStatus.UNDER_REVIEW,
    },
    order: {
      updated_at: 'ASC',
    },
  });
}

async checkOwnerStatus(ownerId: string, restaurantId: string): Promise<{ status: RestaurantStatus; rejection_reason: string | null }> {
  const restaurant = await this.restaurantRepository.findOneBy({ id: restaurantId });

  if (!restaurant) {
    throw new NotFoundException(`Restaurant with ID "${restaurantId}" not found.`);
  }

  // Authorization check: Is this user the owner?
  if (restaurant.owner_id !== ownerId) {
    throw new UnauthorizedException('You do not have permission to view this restaurant\'s status.');
  }

  // Return only the relevant fields
  return {
    status: restaurant.status,
    rejection_reason: restaurant.rejection_reason,
  };
}
}