
import { Injectable, ConflictException, NotFoundException, UnauthorizedException, BadRequestException } from '@nestjs/common';
import { InjectEntityManager, InjectRepository } from '@nestjs/typeorm';
import { EntityManager, In, Repository } from 'typeorm';
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
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';


@Injectable()
export class RestaurantsService {
    // --- THIS IS THE FIX: The constructor is now correct ---
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
        // This decorator tells NestJS to inject the EntityManager
        @InjectEntityManager()
        private readonly entityManager: EntityManager,
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

  if (!restaurant) { throw new NotFoundException(`Restaurant with ID "${restaurantId}" not found.`); }
  if (restaurant.owner_id !== ownerId) { throw new UnauthorizedException('You are not the owner of this restaurant.'); }

  const filename = `${uuidv4()}${path.extname(file.originalname)}`;
  const uploadPath = './uploads/documents';
  const filePath = path.join(uploadPath, filename);

  if (!fs.existsSync(uploadPath)) {
    fs.mkdirSync(uploadPath, { recursive: true });
  }

  fs.writeFileSync(filePath, file.buffer);

  const newDocument = this.documentRepository.create({
    restaurant_id: restaurantId,
    document_type: uploadDto.document_type,
    // --- THIS IS THE FIX ---
    document_url: filePath, // We now store the correct, full relative path
    original_name: file.originalname,
    mimetype: file.mimetype,
  });
  const savedDocument = await this.documentRepository.save(newDocument);

  restaurant.status = RestaurantStatus.UNDER_REVIEW;
  await this.restaurantRepository.save(restaurant);
  
  return savedDocument;
}
async updateStatus(
  restaurantId: string,
  updateStatusDto: UpdateRestaurantStatusDto,
): Promise<Restaurant> {
  // --- The entire operation is wrapped in a transaction for data safety ---
  return this.entityManager.transaction(async (transactionalEntityManager) => {
    const restaurantRepo = transactionalEntityManager.getRepository(Restaurant);
    
    // Find the restaurant AND its owner to get the owner's ID and the previous status
    const restaurant = await restaurantRepo.findOne({
      where: { id: restaurantId },
      relations: ['owner'], 
    });

    if (!restaurant) {
      throw new NotFoundException(`Restaurant with ID "${restaurantId}" not found.`);
    }

    // Capture the state before and after the change
    const previousStatus = restaurant.status;
    const newStatus = updateStatusDto.status as unknown as RestaurantStatus;

    // If the status isn't changing, no need to do anything
    if (previousStatus === newStatus) {
        return restaurant;
    }

    // --- Your original validation logic ---
    if (newStatus === RestaurantStatus.REJECTED && !updateStatusDto.rejection_reason) {
      throw new BadRequestException('Rejection reason is required when rejecting a restaurant.');
    }

    const owner = restaurant.owner;
    if (!owner) {
      throw new NotFoundException(`Owner for restaurant ${restaurantId} not found.`);
    }
    
    // --- Your original role-finding logic ---
    const allRoles = await this.rolesService.findAll();
    const ownerRole = allRoles.find(role => role.name === 'restaurant_owner');

    if (!ownerRole) {
      throw new NotFoundException('"restaurant_owner" role not found. Please seed the database.');
    }

    // --- NEW CORE BUSINESS LOGIC FOR ROLE MANAGEMENT ---
    
    // 1. If the new status is APPROVED, assign the role.
    if (newStatus === RestaurantStatus.APPROVED) {
      await this.usersService.assignRole(
        owner.user_id, // Use owner's ID from the relation
        { roleId: ownerRole.role_id }, 
        transactionalEntityManager // Pass the transaction manager for safety
      );
    } 
    // 2. If it was previously APPROVED and is now being REJECTED, remove the role.
    else if (newStatus === RestaurantStatus.REJECTED && previousStatus === RestaurantStatus.APPROVED) {
      await this.usersService.removeRole(
        owner.user_id,
        { roleId: ownerRole.role_id },
        transactionalEntityManager // Pass the transaction manager for safety
      );
    }
    
    // --- Your original restaurant update logic ---
    restaurant.status = newStatus;
    restaurant.is_active = (newStatus === RestaurantStatus.APPROVED);
    restaurant.rejection_reason = updateStatusDto.rejection_reason || '';
    
    // Save the updated restaurant within the transaction
    const updatedRestaurant = await restaurantRepo.save(restaurant);

    // --- Your original Kafka & Mailer logic (side-effects) ---
    if (newStatus === RestaurantStatus.APPROVED) {
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

    } else { // This covers REJECTED and other non-approved statuses
        this.kafkaProvider.emit('restaurant.rejected', {
            id: restaurant.id, 
            owner_id: restaurant.owner_id, 
            name: restaurant.name, 
            rejection_reason: updateStatusDto.rejection_reason, 
        });

        try {
            await this.mailerProvider.sendMail(
                restaurant.email,
                `Update on your restaurant "${restaurant.name}"`,
                `There was an update regarding your restaurant application. Reason: ${updateStatusDto.rejection_reason}`,
                `<p>There was an update regarding your application for <strong>${restaurant.name}</strong>.</p><p>Reason: ${updateStatusDto.rejection_reason}</p><p>Please contact support for more information.</p>`
            );
        } catch (error) {
            console.error('Failed to send status update email:', error);
        }
    }
  
    return updatedRestaurant;
  });
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
async findForReviewByStatus(statuses: string[]): Promise<Restaurant[]> {
      const validStatuses = statuses.filter(s => Object.values(RestaurantStatus).includes(s as RestaurantStatus));
      if (validStatuses.length === 0) {
        return [];
      }

      return this.restaurantRepository.find({
        where: {
          status: In(validStatuses),
        },
        relations: ['documents'], 
        order: {
          updated_at: 'ASC',
        },
      });
    }

async getRestaurantDocument(
        restaurantId: string,
        documentType: string,
    ): Promise<{ filePath: string; originalName: string; mimetype: string }> {
        const document = await this.documentRepository.findOne({
            where: { restaurant_id: restaurantId, document_type: documentType },
        });

        if (!document || !document.document_url) {
            throw new NotFoundException(`Document of type ${documentType} for restaurant ${restaurantId} not found.`);
        }

        const filePath = document.document_url;
        const fullPath = path.join(process.cwd(), filePath);
        
        if (!fs.existsSync(fullPath)) {
            console.error(`File not found on server at path: ${fullPath}`);
            throw new NotFoundException(`File for document not found on server.`);
        }

        return {
            filePath: filePath,
            originalName: document.original_name || 'document',
            mimetype: document.mimetype || 'application/octet-stream',
        };
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
async getRestaurantProfileByOwnerId(ownerId: string): Promise<Restaurant> {
        const restaurant = await this.restaurantRepository.findOne({
            where: { owner_id: ownerId },
            relations: [
                'addresses',
                'hours',
                'documents',
                'bank_details',
            ],
        });

        if (!restaurant) {
            throw new NotFoundException('No restaurant profile found for the current user.');
        }

        return restaurant;
    }

}
