import { BadRequestException, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { v2 as cloudinary } from 'cloudinary';

@Injectable()
export class UploadsService {
  private readonly isConfigured: boolean;

  constructor(private readonly configService: ConfigService) {
    const cloudName = configService.get<string>('CLOUDINARY_CLOUD_NAME');
    const apiKey = configService.get<string>('CLOUDINARY_API_KEY');
    const apiSecret = configService.get<string>('CLOUDINARY_API_SECRET');

    if (cloudName && apiKey && apiSecret) {
      cloudinary.config({
        cloud_name: cloudName,
        api_key: apiKey,
        api_secret: apiSecret,
        secure: true,
      });
      this.isConfigured = true;
    } else {
      this.isConfigured = false;
    }
  }

  async uploadMenuItemImage(file: Express.Multer.File) {
    if (!this.isConfigured) {
      throw new BadRequestException('Cloudinary is not configured');
    }

    if (!file) {
      throw new BadRequestException('Image file is required');
    }

    return new Promise((resolve, reject) => {
      const uploadStream = cloudinary.uploader.upload_stream(
        {
          folder: 'menu-items',
          resource_type: 'image',
        },
        (error, result) => {
          if (error || !result) {
            return reject(new BadRequestException('Image upload failed'));
          }

          return resolve({
            url: result.secure_url,
            public_id: result.public_id,
            width: result.width,
            height: result.height,
            format: result.format,
            bytes: result.bytes,
          });
        },
      );

      uploadStream.end(file.buffer);
    });
  }
}
