import { ApiProperty } from '@nestjs/swagger';

export class UploadImageDto {
  @ApiProperty({ type: 'string', format: 'binary', description: 'Image file (jpg, png, webp). Max 5MB.' })
  file: any;
}
