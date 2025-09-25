
import { Controller, Post, Body, Req, UseGuards } from '@nestjs/common';
import { Request } from 'express';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth } from '@nestjs/swagger';
import { AuthService } from './auth.service';
import { RegisterDto } from './dtos/register.dto';
import { LoginDto } from './dtos/login.dto';
import { RefreshTokenDto } from './dtos/refresh-token.dto';
import { VerifyOtpDto } from './dtos/verify-otp.dto';
import { LogoutDto } from './dtos/logout.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { LoginResponseDto } from './dtos/login-response.dto';
import { ApiOkResponse } from '@nestjs/swagger';

@ApiTags('Auth') // Groups under "Auth"
@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('register')
  @ApiOperation({ summary: 'Register a new user' })
  @ApiResponse({ status: 201, description: 'User registered successfully' })
  async register(@Body() dto: RegisterDto) {
    return this.authService.register(dto);
  }

  @Post('verify')
  @ApiOperation({ summary: 'Verify OTP for account activation' })
  async verify(@Body() dto: VerifyOtpDto) {
    return this.authService.verifyOtp(dto);
  }


// @Post('login')
// @ApiOperation({ summary: 'User login' })
// @ApiOkResponse({ type: LoginResponseDto })
// async login(@Body() dto: LoginDto, @Req() req: Request): Promise<LoginResponseDto> {
//   const user = await this.authService.validateUserCredentials(dto.email, dto.password);

//   const userAgent = Array.isArray(req.headers['user-agent'])
//     ? req.headers['user-agent'][0]
//     : req.headers['user-agent'] || 'unknown';

//   const ip = req.ip || req.connection.remoteAddress || 'unknown';

//   return this.authService.login(user, userAgent, ip);
// }

@Post('login')
@ApiOperation({ summary: 'User login' })
@ApiOkResponse({ type: LoginResponseDto })
async login(@Body() dto: LoginDto, @Req() req: Request): Promise<LoginResponseDto> {
  const user = await this.authService.validateUserCredentials(dto.email, dto.password);

  const userAgent = Array.isArray(req.headers['user-agent'])
    ? req.headers['user-agent'][0]
    : req.headers['user-agent'] || 'unknown';

  const ip = req.ip || (req.connection && (req.connection as any).remoteAddress) || 'unknown';

  // pass dto.remember (boolean) to service
  return this.authService.login(user, userAgent, ip, !!dto.remember);
}

  @Post('refresh')
  @ApiOperation({ summary: 'Refresh access token' })
  async refresh(@Body() dto: RefreshTokenDto) {
    return this.authService.refresh(dto);
  }

  @Post('revoke')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('access-token')
  @ApiOperation({ summary: 'Revoke a refresh token' })
  async revoke(@Body('refresh_token') refresh_token: string) {
    return this.authService.revoke(refresh_token);
  }

  @Post('logout')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('access-token')
  @ApiOperation({ summary: 'Logout user (revoke refresh token)' })
  async logout(@CurrentUser('sub') userId: string, @Body() dto: LogoutDto) {
    return this.authService.logout(userId, dto.refreshToken);
  }
  
}
