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

  @ApiProperty({ description: 'Given name', required: false })
  @Expose()
  firstName?: string | null;

  @ApiProperty({ description: 'Family name', required: false })
  @Expose()
  lastName?: string | null;

  @ApiProperty({ description: 'Assigned roles', type: [RoleShortDto], required: false })
  @Expose()
  @Type(() => RoleShortDto)
  roles?: RoleShortDto[];
}
