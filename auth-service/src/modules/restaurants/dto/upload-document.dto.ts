

import { ApiProperty } from '@nestjs/swagger';
import { IsEnum, IsNotEmpty } from 'class-validator';

// An enum to enforce specific document types
export enum DocumentType {
  BUSINESS_LICENSE = 'BUSINESS_LICENSE',
  TAX_CERTIFICATE = 'TAX_CERTIFICATE',
  HEALTH_CERTIFICATE = 'HEALTH_CERTIFICATE',
}

export class UploadDocumentDto {
  @ApiProperty({ enum: DocumentType }) 
  @IsEnum(DocumentType)
  @IsNotEmpty()
  document_type: DocumentType;
}