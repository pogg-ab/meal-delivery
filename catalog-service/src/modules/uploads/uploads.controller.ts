import {
  BadRequestException,
  Controller,
  Post,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import { ApiBearerAuth, ApiBody, ApiConsumes, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { UploadsService } from './uploads.service';
import { UploadImageDto } from './dto/upload-image.dto';

@ApiTags('Uploads')
@Controller('uploads')
export class UploadsController {
  constructor(private readonly uploadsService: UploadsService) {}

  @Post('menu-item-image')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('access-token')
  @ApiOperation({ summary: 'Upload menu item image to Cloudinary' })
  @ApiConsumes('multipart/form-data')
  @ApiBody({ type: UploadImageDto })
  @ApiResponse({
    status: 201,
    description: 'Image uploaded successfully. Returns a secure URL.',
  })
  @ApiResponse({ status: 400, description: 'Invalid file or Cloudinary not configured.' })
  @UseInterceptors(
    FileInterceptor('file', {
      storage: memoryStorage(),
      limits: { fileSize: 5 * 1024 * 1024 },
      fileFilter: (_req, file, cb) => {
        if (!file.mimetype.startsWith('image/')) {
          return cb(new BadRequestException('Only image files are allowed'), false);
        }
        return cb(null, true);
      },
    }),
  )
  uploadMenuItemImage(
    @UploadedFile() file: Express.Multer.File,
  ) {
    return this.uploadsService.uploadMenuItemImage(file);
  }
}
