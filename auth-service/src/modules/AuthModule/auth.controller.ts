
import { Controller, Post, Body, Req, UseGuards, HttpStatus, HttpCode, Delete, Param, Patch } from '@nestjs/common';
import { Request } from 'express';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth, ApiBody, ApiParam } from '@nestjs/swagger';
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
import { ResendOtpDto } from './dtos/resend-otp.dto';
import { ForgotPasswordDto } from './dtos/forgot-password.dto';
import { ResetPasswordDto } from './dtos/reset-password.dto';
import { DeleteUserParamsDto } from './dtos/delete-user.dto';
import { DeleteAllCustomersDto } from './dtos/delete-all-user.dto';
import { ChangePasswordDto } from './dtos/change-password.dto';
import { UsersService } from '../UserModule/user.service';

@ApiTags('Auth') // Groups under "Auth"
@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService,
     private readonly usersService: UsersService,
  ) {}

  @Post('register')
  @ApiOperation({ summary: 'Register a new user - Enter Full name' })
  @ApiResponse({ status: 201, description: 'User registered successfully' })
  async register(@Body() dto: RegisterDto) {
    return this.authService.register(dto);
  }

  @Post('verify')
  @ApiOperation({ summary: 'Verify OTP for account activation' })
  async verify(@Body() dto: VerifyOtpDto) {
    return this.authService.verifyOtp(dto);
  }


@Post('login')
@ApiOperation({ summary: 'User login' })
@ApiOkResponse({ type: LoginResponseDto })
async login(@Body() dto: LoginDto, @Req() req: Request): Promise<LoginResponseDto> {
  const user = await this.authService.validateUserCredentials(dto.email, dto.password);
  console.log(user);

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


  @Post('resend')
  @ApiOperation({ summary: 'Resend OTP (if previous expired or used)' })
  @ApiResponse({ status: 200, description: 'Resent OTP or informed still valid' })
  @ApiBody({ type: ResendOtpDto })
  async resendOtp(@Body() dto: ResendOtpDto) {
    return this.authService.resendOtp(dto.email, (dto as any).purpose ?? 'registration');
  }

  @Post('forgot-password')
  @ApiOperation({ summary: 'Request password reset OTP (forgot password)' })
  @ApiResponse({ status: 200, description: 'OTP sent if user exists (generic response)' })
  @ApiBody({ type: ForgotPasswordDto })
  async forgotPassword(@Body() dto: ForgotPasswordDto) {
    return this.authService.forgotPassword(dto.email);
  }

  @Post('reset-password')
  @ApiOperation({ summary: 'Reset password using password reset OTP' })
  @ApiResponse({ status: 200, description: 'Password reset successful' })
  @ApiBody({ type: ResetPasswordDto })
  async resetPassword(@Body() dto: ResetPasswordDto) {
    return this.authService.resetPassword(dto);
  }

@Patch('change-password')
@UseGuards(JwtAuthGuard)
@HttpCode(HttpStatus.OK)
@ApiBearerAuth('access-token')
@ApiOperation({ summary: 'Change authenticated user password' })
async changePassword(
  @Req() req: any,
  @Body() changePasswordDto: ChangePasswordDto,
) {
  const userId = req.user.userId;
  await this.usersService.changePassword(userId, changePasswordDto);

  return { message: 'Password changed successfully' };
}

  @Delete(':id')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Delete a customer by id' })
  @ApiParam({ name: 'id', description: 'User UUID to delete' })
  @ApiResponse({ status: 200, description: 'User deleted', schema: { example: { user_id: 'uuid', message: 'user_deleted' } } })
  @ApiResponse({ status: 404, description: 'User not found' })
  @ApiResponse({ status: 403, description: 'User is not a customer' })
  async deleteUser(@Param() params: DeleteUserParamsDto) {
    return await this.authService.deleteUserIfCustomer(params.id);
  }


  /**
   * DELETE /users/customers
   * Deletes ALL users that have the "customer" role.
   * Body: { confirm: true } — required to perform deletion (safety in Swagger).
   */
  @Delete('customers')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Delete all users with the customer role' })
  @ApiBody({ type: DeleteAllCustomersDto, required: true })
  @ApiResponse({ status: 200, description: 'Customers deleted', schema: { example: { deleted: 42, message: 'customers_deleted' } } })
  @ApiResponse({ status: 400, description: 'Bad request (confirm missing or false)' })
  async deleteAllCustomers(@Body() body: DeleteAllCustomersDto) {
    if (!body.confirm) {
      return { deleted: 0, message: 'confirm_required' };
    }
    return await this.authService.deleteAllCustomers();
  }
}
