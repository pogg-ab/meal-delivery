// auth-service/src/modules/analytics/analytics.controller.ts
import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard'; // Assuming you have this
import { Roles } from '../../common/decorators/roles.decorator'; // Assuming you have this
import { AuthService } from '../AuthModule/auth.service';
import { CustomerGrowthQueryDto } from './dto/customer-growth-query.dto';
import { CustomerGrowthDto } from './dto/customer-growth.dto';

@ApiTags('Admin Analytics')
@Controller('admin/analytics')
@UseGuards(JwtAuthGuard, RolesGuard) // IMPORTANT: Secures the entire controller
@ApiBearerAuth('access-token')
export class AnalyticsController {
  constructor(private readonly authService: AuthService) {}

  @Get('customers/growth')
  @Roles('platform_admin') // Note the 'admin' role for security
  @ApiOperation({
    summary: 'Get daily new customer sign-up trends',
    description: 'Provides a time-series of new user registrations, accessible only by administrators.',
  })
  @ApiOkResponse({
    description: 'Successfully retrieved customer growth data.',
    type: [CustomerGrowthDto],
  })
  async getCustomerGrowth(@Query() query: CustomerGrowthQueryDto): Promise<CustomerGrowthDto[]> {
    return this.authService.getCustomerGrowth(query);
  }
}