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
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { RestaurantsService } from './restaurants.service';
import { RegisterRestaurantDto } from './dto/register-restaurant.dto';
import { UploadDocumentDto } from './dto/upload-document.dto';
import { UpdateRestaurantStatusDto } from './dto/update-restaurant-status.dto';
import { ApiTags, ApiBearerAuth, ApiOperation, ApiConsumes, ApiBody } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from 'src/common/decorators/roles.decorator';
import { UpdateRestaurantDto } from './dto/update-restaurant.dto';

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
  ) {
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
@Get('pending-review')
@Roles('platform_admin')
@UseGuards(JwtAuthGuard, RolesGuard)
@ApiBearerAuth('access-token')
@ApiOperation({ summary: 'Get all restaurants awaiting admin approval (Admin only)' })
getPendingRestaurants() {
  return this.restaurantsService.findPendingReview();
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

}