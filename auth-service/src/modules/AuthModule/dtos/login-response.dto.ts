import { ApiProperty } from '@nestjs/swagger';

export class LoginResponseDto {
  @ApiProperty({ example: 'jwt-access-token' })
  accessToken: string;

  @ApiProperty({ example: 'jwt-refresh-token' })
  refreshToken: string;

  @ApiProperty({ example: ['admin', 'user'] })
  roles: string[];

//   @ApiProperty({ example: ['read_users', 'edit_users'] })
//   permissions: string[];
}
