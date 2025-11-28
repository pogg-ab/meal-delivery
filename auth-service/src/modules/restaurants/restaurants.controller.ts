import {
  Controller,
  Post,
  Body,
  UseGuards,
  Req,
  Param,
  Put,
  HttpCode,
  HttpStatus,
  UploadedFile,
  UseInterceptors,
  ParseFilePipe,
  MaxFileSizeValidator,
  FileTypeValidator,
  Get,
  ClassSerializerInterceptor,
  Query,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { RestaurantsService } from './restaurants.service';
import { RegisterRestaurantDto } from './dto/register-restaurant.dto';
import { UploadDocumentDto } from './dto/upload-document.dto';
import { UpdateRestaurantStatusDto } from './dto/update-restaurant-status.dto';
import { ApiTags, ApiBearerAuth, ApiOperation, ApiConsumes, ApiBody, ApiResponse } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from 'src/common/decorators/roles.decorator';
import { UpdateRestaurantDto } from './dto/update-restaurant.dto';
import { RestaurantProfileDto } from './dto/restaurant-profile.dto';
import { Restaurant } from 'src/entities/restaurant.entity';
import { UpdateHoursDto } from './dto/update-hours.dto';
import { UpdateAddressDto } from './dto/update-address.dto';
import { BankDetailsDto } from './dto/bank-details.dto';

interface AuthenticatedUser {
  userId: string;
  roles: string[];
  restaurantId?: string;
}

@ApiTags('Restaurants')
@Controller('restaurants')
export class RestaurantsController {
  constructor(private readonly restaurantsService: RestaurantsService) {}

  @Post('register')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('access-token')
  @ApiOperation({ summary: 'Register a new restaurant' })
  register(
    @Body() registerRestaurantDto: RegisterRestaurantDto,
    @Req() req,
  ) {
    const ownerId = req.user.userId;
    return this.restaurantsService.register(registerRestaurantDto, ownerId);
  }

 @Post(':id/documents')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('access-token')
  @ApiOperation({ summary: 'Upload a verification document for a restaurant' })
  @ApiResponse({ 
    status: 201, 
    description: 'Document uploaded successfully. Returns a URL to view the document.',
    schema: {
      type: 'object',
      properties: {
        url: {
          type: 'string',
          example: 'http://localhost:3000/restaurants/your-restaurant-id/documents/BUSINESS_LICENSE'
        }
      }
    }
  })
  @UseInterceptors(FileInterceptor('file'))
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        document_type: {
          type: 'string',
          enum: ['BUSINESS_LICENSE', 'TAX_CERTIFICATE', 'HEALTH_CERTIFICATE'],
        },
        file: {
          type: 'string',
          format: 'binary',
        },
      },
    },
  })
  uploadDocument(
    @Param('id') restaurantId: string,
    @Body() uploadDocumentDto: UploadDocumentDto,
    @UploadedFile(
      new ParseFilePipe({
        validators: [
          new MaxFileSizeValidator({ maxSize: 5 * 1024 * 1024 }), // 5 MB
          new FileTypeValidator({ fileType: '.(png|jpeg|jpg|pdf)' }),
        ],
      }),
    ) file: Express.Multer.File,
    @Req() req,
  ): Promise<{ url: string }> {
    const ownerId = req.user.userId;
    return this.restaurantsService.addDocument(
      ownerId,
      restaurantId,
      uploadDocumentDto,
      file,
    );
  }

  @Put(':id/status')
  @Roles('platform_admin') // Only users with the 'ADMIN' role can access this
  @UseGuards(JwtAuthGuard, RolesGuard)
  @ApiBearerAuth('access-token')
  @ApiOperation({ summary: "Update a restaurant's status (Admin only)" })
  @HttpCode(HttpStatus.OK)
  updateStatus(
    @Param('id') restaurantId: string,
    @Body() updateStatusDto: UpdateRestaurantStatusDto,
  ) {
    return this.restaurantsService.updateStatus(restaurantId, updateStatusDto);
  }

@Put(':id')
@UseGuards(JwtAuthGuard) // Only authenticated users
@ApiBearerAuth('access-token')
@ApiOperation({ summary: "Update a restaurant's profile (Owner only)" })
updateProfile(
  @Param('id') restaurantId: string,
  @Body() updateRestaurantDto: UpdateRestaurantDto,
  @Req() req,
) {
  const ownerId = req.user.userId;
  return this.restaurantsService.updateProfile(ownerId, restaurantId, updateRestaurantDto);
}

 // --- UPDATE: Replaced 'pending-review' with a more flexible endpoint ---
  @Get('for-review')
  @Roles('platform_admin')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @ApiBearerAuth('access-token')
  @ApiOperation({ summary: 'Get restaurants by status for admin review (e.g., ?status=APPROVED,UNDER_REVIEW)' })
  getRestaurantsForReview(@Query('status') status?: string) {
    // Default to 'UNDER_REVIEW' if no status is provided
    const statuses = status
      ? status.split(',').map(s => s.trim().toUpperCase())
      : ['UNDER_REVIEW'];
    return this.restaurantsService.findForReviewByStatus(statuses);
  }

  // --- ADD: This is the new endpoint for serving documents securely ---
  @Get(':id/documents/:documentType')
  @Roles('platform_admin', 'restaurant_owner')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @ApiBearerAuth('access-token')
  @ApiOperation({ summary: 'Get a restaurant verification document URL (Admin or Owner of the restaurant)' })
  @ApiResponse({
    status: 200,
    description: 'Document URL retrieved successfully.',
    schema: {
      type: 'object',
      properties: {
        url: {
          type: 'string',
          example: 'https://mealsystem.basirahtv.com/auth/restaurants/uuid/documents/BUSINESS_LICENSE'
        }
      }
    }
  })
  async getRestaurantDocument(
    @Param('id') restaurantId: string,
    @Param('documentType') documentType: string,
    @Req() req, // Pass the request to get the user
  ): Promise<{ url: string }> {
    const user: AuthenticatedUser = req.user; // Extract the user payload

    // Pass the user to the service for authorization check
    await this.restaurantsService.checkDocumentAccess(restaurantId, documentType, user);

    // Construct the full URL
    const baseUrl = process.env.API_BASE_URL || 'http://localhost:8000';
    const url = `${baseUrl}/restaurants/${restaurantId}/documents/${documentType}`;

    return { url };
  }

@Get(':id/status')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth('access-token')
@ApiOperation({ summary: 'Check the status of your restaurant (Owner only)' })
checkStatus(
  @Param('id') restaurantId: string,
  @Req() req,
) {
  const ownerId = req.user.userId;
  return this.restaurantsService.checkOwnerStatus(ownerId, restaurantId);
}

@Get('me') // <-- NEW ENDPOINT
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('access-token')
  @ApiOperation({ summary: 'Get the profile of the authenticated owner\'s restaurant' })
  @ApiResponse({ status: 200, description: 'Restaurant profile retrieved successfully.', type: RestaurantProfileDto })
  @ApiResponse({ status: 404, description: 'No restaurant profile found for the current user.' })
  @UseInterceptors(ClassSerializerInterceptor) // <-- Helps with DTO transformation
  getMyRestaurantProfile(@Req() req): Promise<Restaurant> {
    const ownerId = req.user.userId;
    return this.restaurantsService.getRestaurantProfileByOwnerId(ownerId);
  }

  @Put(':id/address')
  @Roles('restaurant_owner')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @ApiBearerAuth('access-token')
  @ApiOperation({ summary: "Update your restaurant's address (Owner only)" })
  updateAddress(
    @Param('id') restaurantId: string,
    @Body() updateAddressDto: UpdateAddressDto,
    @Req() req,
  ) {
    const ownerId = req.user.userId;
    return this.restaurantsService.updateAddress(ownerId, restaurantId, updateAddressDto);
  }

  @Put(':id/hours')
  @Roles('restaurant_owner')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @ApiBearerAuth('access-token')
  @ApiOperation({ summary: "Update your restaurant's weekly hours (Owner only)" })
  updateHours(
    @Param('id') restaurantId: string,
    @Body() updateHoursDto: UpdateHoursDto, // Use the wrapper DTO for validation
    @Req() req,
  ) {
    const ownerId = req.user.userId;
    // Pass the inner 'hours' array to the service
    return this.restaurantsService.updateHours(ownerId, restaurantId, updateHoursDto.hours);
  }

  @Put(':id/bank-details')
  @Roles('restaurant_owner')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @ApiBearerAuth('access-token')
  @ApiOperation({ summary: "Add or update your restaurant's bank details (Owner only)" })
  updateBankDetails(
    @Param('id') restaurantId: string,
    @Body() bankDetailsDto: BankDetailsDto,
    @Req() req,
  ) {
    const ownerId = req.user.userId;
    return this.restaurantsService.upsertBankDetails(ownerId, restaurantId, bankDetailsDto);
  }

}
