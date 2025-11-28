
import { Injectable, ConflictException, NotFoundException, UnauthorizedException, BadRequestException, ForbiddenException } from '@nestjs/common';
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
import { RestaurantHourDto } from './dto/update-hours.dto';
import { UpdateAddressDto } from './dto/update-address.dto';
import { BankDetailsDto } from './dto/bank-details.dto';

interface AuthenticatedUser {
  userId: string;
  roles: string[];
  restaurantId?: string;
}


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


    // --- Helper to emit full restaurant update ---
    private async emitRestaurantUpdate(restaurantId: string) {
        const restaurant = await this.restaurantRepository.findOne({
            where: { id: restaurantId },
            relations: ['addresses', 'hours'],
        });

        if (!restaurant) return;

        const primaryAddress = restaurant.addresses && restaurant.addresses.length > 0
            ? restaurant.addresses[0]
            : null;

        const flattenedHours = {
            sunday_open: null, sunday_close: null,
            monday_open: null, monday_close: null,
            tuesday_open: null, tuesday_close: null,
            wednesday_open: null, wednesday_close: null,
            thursday_open: null, thursday_close: null,
            friday_open: null, friday_close: null,
            saturday_open: null, saturday_close: null,
        };

        const dayMap = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];

        for (const hour of restaurant.hours) {
            const dayName = dayMap[hour.weekday];
            if (dayName && !hour.is_closed) {
                flattenedHours[`${dayName}_open`] = hour.open_time;
                flattenedHours[`${dayName}_close`] = hour.close_time;
            }
        }

        // Emit 'restaurant.profile.updated' which the catalog service listens to
        this.kafkaProvider.emit('restaurant.profile.updated', {
            id: restaurant.id,
            name: restaurant.name,
            description: restaurant.description,
            owner_id: restaurant.owner_id,
            is_active: restaurant.is_active,
            address: primaryAddress ? {
                street: primaryAddress.street,
                city: primaryAddress.city,
                region: primaryAddress.region,
                country: primaryAddress.country,
                latitude: primaryAddress.latitude,
                longitude: primaryAddress.longitude,
            } : null,
            ...flattenedHours,
        });
    }

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
    ): Promise<{ url: string }> { // <-- 1. Change the return type
        const restaurant = await this.restaurantRepository.findOneBy({ id: restaurantId });

        if (!restaurant) { throw new NotFoundException(`Restaurant with ID "${restaurantId}" not found.`); }
        if (restaurant.owner_id !== ownerId) { throw new UnauthorizedException('You are not the owner of this restaurant.'); }

        // --- This part remains exactly the same ---
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
            document_url: filePath, // We still store the local path for our server to find the file
            original_name: file.originalname,
            mimetype: file.mimetype,
        });
        await this.documentRepository.save(newDocument);

        restaurant.status = RestaurantStatus.UNDER_REVIEW;
        await this.restaurantRepository.save(restaurant);
        // --- End of unchanged part ---

        // --- 2. Construct and return the full API URL ---
        const baseUrl = process.env.API_BASE_URL || 'http://localhost:8000';
        const documentUrl = `${baseUrl}/restaurants/${restaurantId}/documents/${uploadDto.document_type}/file`;

        return { url: documentUrl };
    }

async updateStatus(
  restaurantId: string,
  updateStatusDto: UpdateRestaurantStatusDto,
): Promise<Restaurant> {
  // --- The entire operation is wrapped in a transaction for data safety ---
  return this.entityManager.transaction(async (transactionalEntityManager) => {
    const restaurantRepo = transactionalEntityManager.getRepository(Restaurant);
    
    // --- STEP 1: MODIFY RELATION LOADING ---
    // We now also load 'hours' to include in the Kafka event.
    const restaurant = await restaurantRepo.findOne({
      where: { id: restaurantId },
      // Load all necessary relations for the Kafka event in one go
      relations: ['owner', 'addresses', 'hours'], 
    });

    if (!restaurant) {
      throw new NotFoundException(`Restaurant with ID "${restaurantId}" not found.`);
    }

    const previousStatus = restaurant.status;
    const newStatus = updateStatusDto.status as unknown as RestaurantStatus;

    if (previousStatus === newStatus) {
        return restaurant;
    }

    if (newStatus === RestaurantStatus.REJECTED && !updateStatusDto.rejection_reason) {
      throw new BadRequestException('Rejection reason is required when rejecting a restaurant.');
    }

    const owner = restaurant.owner;
    if (!owner) {
      throw new NotFoundException(`Owner for restaurant ${restaurantId} not found.`);
    }
    
    const allRoles = await this.rolesService.findAll();
    const ownerRole = allRoles.find(role => role.name === 'restaurant_owner');

    if (!ownerRole) {
      throw new NotFoundException('"restaurant_owner" role not found. Please seed the database.');
    }
    
    if (newStatus === RestaurantStatus.APPROVED) {
      await this.usersService.assignRole(
        owner.user_id,
        { roleId: ownerRole.role_id }, 
        transactionalEntityManager
      );
    } 
    else if (newStatus === RestaurantStatus.REJECTED && previousStatus === RestaurantStatus.APPROVED) {
      await this.usersService.removeRole(
        owner.user_id,
        { roleId: ownerRole.role_id },
        transactionalEntityManager
      );
    }
    
    restaurant.status = newStatus;
    restaurant.is_active = (newStatus === RestaurantStatus.APPROVED);
    restaurant.rejection_reason = updateStatusDto.rejection_reason || '';
    
    const updatedRestaurant = await restaurantRepo.save(restaurant);

    // --- Side-effects (Kafka & Mailer) ---
    if (newStatus === RestaurantStatus.APPROVED) {
        
        // Prepare the address payload (your existing logic)
        const primaryAddress = restaurant.addresses && restaurant.addresses.length > 0 
            ? restaurant.addresses[0] 
            : null;

        // --- STEP 2: FLATTEN THE OPERATING HOURS ---
        const flattenedHours = {
            sunday_open: null, sunday_close: null,
            monday_open: null, monday_close: null,
            tuesday_open: null, tuesday_close: null,
            wednesday_open: null, wednesday_close: null,
            thursday_open: null, thursday_close: null,
            friday_open: null, friday_close: null,
            saturday_open: null, saturday_close: null,
        };

        const dayMap = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
        
        // Use the 'hours' relation we loaded earlier
        for (const hour of restaurant.hours) {
            const dayName = dayMap[hour.weekday];
            if (dayName && !hour.is_closed) {
                flattenedHours[`${dayName}_open`] = hour.open_time;
                flattenedHours[`${dayName}_close`] = hour.close_time;
            }
        }
        // --- END OF STEP 2 ---

        // --- STEP 3: EMIT THE ENHANCED KAFKA EVENT ---
       this.kafkaProvider.emit('restaurant.approved', {
    // Top-level fields remain the same
    id: restaurant.id,
    name: restaurant.name,
    description: restaurant.description,
    owner_id: restaurant.owner_id,
    is_active: restaurant.is_active,

    // THE FIX: We create the nested 'address' object that your consumer expects.
    address: primaryAddress ? {
        street: primaryAddress.street,
        city: primaryAddress.city,
        region: primaryAddress.region,
        country: primaryAddress.country,
        latitude: primaryAddress.latitude,
        longitude: primaryAddress.longitude,
    } : null,

    ...flattenedHours,
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

  if (restaurant.owner_id !== ownerId) {
    throw new UnauthorizedException('You do not have permission to edit this restaurant.');
  }
  
  // --- LOGIC SIMPLIFIED ---
  // We no longer handle bank_details here.
  Object.assign(restaurant, updateDto);
  
  const savedRestaurant = await this.restaurantRepository.save(restaurant);

  // Emit update event
  await this.emitRestaurantUpdate(savedRestaurant.id);

  return savedRestaurant;
}
async findForReviewByStatus(statuses: string[]): Promise<Restaurant[]> {
      const validStatuses = statuses.filter(s => Object.values(RestaurantStatus).includes(s as RestaurantStatus));
      if (validStatuses.length === 0) {
        return [];
      }

      const restaurants = await this.restaurantRepository.find({
        where: {
          status: In(validStatuses),
        },
        relations: ['documents'], 
        order: {
          updated_at: 'ASC',
        },
      });

      return restaurants.map(restaurant => this.transformRestaurantDocuments(restaurant));
    }

async getRestaurantDocument(
            restaurantId: string,
            documentType: string,
            user: AuthenticatedUser, // <-- MODIFIED: Accept the user object
        ): Promise<{ filePath: string; originalName: string; mimetype: string }> {
            
            // --- NEW: Authorization Logic Block ---
            const isAdmin = user.roles.includes('platform_admin');
            const isOwner = user.roles.includes('restaurant_owner');

            // Rule: If the user is an owner, they can only access their own restaurant's documents.
            if (isOwner && !isAdmin && user.restaurantId !== restaurantId) {
                throw new ForbiddenException('You do not have permission to view documents for this restaurant.');
            }
            // --- End of New Logic ---

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

async checkDocumentAccess(
            restaurantId: string,
            documentType: string,
            user: AuthenticatedUser,
        ): Promise<void> {
            // --- Authorization Logic ---
            const isAdmin = user.roles.includes('platform_admin');
            const isOwner = user.roles.includes('restaurant_owner');

            // Rule: If the user is an owner, they can only access their own restaurant's documents.
            if (isOwner && !isAdmin && user.restaurantId !== restaurantId) {
                throw new ForbiddenException('You do not have permission to view documents for this restaurant.');
            }

            // Check if the document exists
            const document = await this.documentRepository.findOne({
                where: { restaurant_id: restaurantId, document_type: documentType },
            });

            if (!document || !document.document_url) {
                throw new NotFoundException(`Document of type ${documentType} for restaurant ${restaurantId} not found.`);
            }

            const filePath = document.document_url;
            const fullPath = path.join(process.cwd(), filePath);
            
            if (!fs.existsSync(fullPath)) {
                throw new NotFoundException(`File for document not found on server.`);
            }
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

        return this.transformRestaurantDocuments(restaurant);
    }


    async updateAddress(
  ownerId: string,
  restaurantId: string,
  addressDto: UpdateAddressDto,
): Promise<Address> {
  // First, verify the owner has rights to this restaurant
  const restaurant = await this.restaurantRepository.findOneBy({ id: restaurantId });
  if (!restaurant) { throw new NotFoundException(`Restaurant with ID "${restaurantId}" not found.`); }
  if (restaurant.owner_id !== ownerId) { throw new UnauthorizedException('You do not have permission to edit this restaurant.'); }

  // Find the existing address. We assume one address per restaurant for now.
  let address = await this.addressRepository.findOne({ where: { restaurant_id: restaurantId }});

  if (address) {
    // Address exists, update it
    Object.assign(address, addressDto);
  } else {
    // This case is unlikely if registration is done correctly, but we can handle it.
    address = this.addressRepository.create({
      ...addressDto,
      restaurant_id: restaurantId,
    });
  }
  
  const savedAddress = await this.addressRepository.save(address);
  
  // Emit update event
  await this.emitRestaurantUpdate(restaurantId);

  return savedAddress;
}

async updateHours(
  ownerId: string,
  restaurantId: string,
  hoursDto: RestaurantHourDto[], // The input is an array of hours
): Promise<RestaurantHour[]> {
  const restaurant = await this.restaurantRepository.findOneBy({ id: restaurantId });
  if (!restaurant) { throw new NotFoundException(`Restaurant with ID "${restaurantId}" not found.`); }
  if (restaurant.owner_id !== ownerId) { throw new UnauthorizedException('You do not have permission to edit this restaurant.'); }

  // This is the "delete-then-insert" strategy, wrapped in a transaction for safety
  const result = await this.entityManager.transaction(async transactionalEntityManager => {
    const hourRepo = transactionalEntityManager.getRepository(RestaurantHour);

    // 1. Delete all existing hours for this restaurant
    await hourRepo.delete({ restaurant_id: restaurantId });

    // 2. Create new hour entities from the DTO
    const newHours = hoursDto.map(hour => hourRepo.create({
      ...hour,
      restaurant_id: restaurantId,
    }));

    // 3. Save all the new hours in a single operation
    return hourRepo.save(newHours);
  });

  // Emit update event (outside transaction)
  await this.emitRestaurantUpdate(restaurantId);

  return result;
}

async upsertBankDetails(
  ownerId: string,
  restaurantId: string,
  bankDetailsDto: BankDetailsDto,
): Promise<RestaurantBankDetail> {
  const restaurant = await this.restaurantRepository.findOneBy({ id: restaurantId });

  if (!restaurant) {
    throw new NotFoundException(`Restaurant with ID "${restaurantId}" not found.`);
  }

  if (restaurant.owner_id !== ownerId) {
    throw new UnauthorizedException('You do not have permission to edit this restaurant.');
  }

  let bankDetail = await this.bankDetailRepository.findOne({ where: { restaurant_id: restaurantId } });

  if (bankDetail) {
    // Details exist, so update them
    Object.assign(bankDetail, bankDetailsDto);
  } else {
    // Details do not exist, create a new entry
    bankDetail = this.bankDetailRepository.create({
      ...bankDetailsDto,
      restaurant_id: restaurantId,
    });
  }

  return this.bankDetailRepository.save(bankDetail);
}

    private transformRestaurantDocuments(restaurant: Restaurant): Restaurant {
        if (restaurant.documents) {
            const baseUrl = process.env.API_BASE_URL || 'http://localhost:8000';
            restaurant.documents.forEach(doc => {
              doc.document_url = `${baseUrl}/restaurants/${restaurant.id}/documents/${doc.document_type}/file`;
            });
        }
        return restaurant;
    }
}
