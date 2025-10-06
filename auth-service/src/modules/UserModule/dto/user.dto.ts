// import { ApiProperty } from '@nestjs/swagger';
// import { Expose, Type } from 'class-transformer';
// import { RoleShortDto } from './role-short.dto';

// export class UserDto {
//   @ApiProperty({ description: 'UUID of the user' })
//   @Expose()
//   user_id: string;

//   @ApiProperty({ description: 'User email' })
//   @Expose()
//   email: string;

//   @ApiProperty({ description: 'Given name', required: false })
//   @Expose()
//   firstName?: string | null;

//   @ApiProperty({ description: 'Family name', required: false })
//   @Expose()
//   lastName?: string | null;

//   @ApiProperty({ description: 'Assigned roles', type: [RoleShortDto], required: false })
//   @Expose()
//   @Type(() => RoleShortDto)
//   roles?: RoleShortDto[];
// }

// src/modules/UserModule/dto/user.dto.ts
import { ApiProperty } from '@nestjs/swagger';
import { Expose, Type } from 'class-transformer';
import { RoleShortDto } from './role-short.dto';

export class UserDto {
  @ApiProperty({ description: 'UUID of the user' })
  @Expose()
  user_id: string;

  @ApiProperty({ description: 'User email' })
  @Expose()
  email: string;

  @ApiProperty({ description: 'Username / handle', required: false, nullable: true })
  @Expose()
  username?: string | null;

  @ApiProperty({ description: 'Given name', required: false, nullable: true })
  @Expose()
  firstName?: string | null;

  @ApiProperty({ description: 'Family name', required: false, nullable: true })
  @Expose()
  lastName?: string | null;

  @ApiProperty({ description: 'Phone number', required: false, nullable: true })
  @Expose()
  phone?: string | null;

  // @ApiProperty({ description: 'Preferences (json)', required: false, type: 'object' })
  // @Expose()
  // preferences?: Record<string, any> | null;

  @ApiProperty({ description: 'Loyalty points', required: false })
  @Expose()
  loyalty_points: number;

  @ApiProperty({ description: 'Is email/phone verified' })
  @Expose()
  is_verified: boolean;

  // @ApiProperty({ description: 'OTP code (nullable)', required: false, nullable: true })
  // @Expose()
  // otp_code?: string | null;

  // @ApiProperty({ description: 'OTP expiration timestamp', required: false, nullable: true })
  // @Expose()
  // otp_expires_at?: Date | null;

  // @ApiProperty({ description: 'Verified at timestamp', required: false, nullable: true })
  // @Expose()
  // verified_at?: Date | null;

  // @ApiProperty({ description: 'Record created at' })
  // @Expose()
  // created_at: Date;

  // @ApiProperty({ description: 'Record updated at' })
  // @Expose()
  // updated_at: Date;

  @ApiProperty({ description: 'Assigned roles', type: [RoleShortDto], required: false })
  @Expose()
  @Type(() => RoleShortDto)
  roles?: RoleShortDto[] | null;
}

