import { Controller, Get, Req, Query, Param, UseGuards, ParseUUIDPipe, BadRequestException } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiParam, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { MenuPersonalizationService } from './menu-personalization.service';
import { GetPersonalizedMenuDto } from './dto/get-personalized-menu.dto';

@ApiTags('Menu Personalization')
@Controller('menu-personalization')
export class MenuPersonalizationController {
  constructor(private readonly menuPersonalizationService: MenuPersonalizationService) {}

//   @UseGuards(JwtAuthGuard)
//   @ApiBearerAuth('access-token')
//   @Get('/global')
//   @ApiOperation({ summary: 'Get globally personalized menu for the customer' })
//   async getGlobalMenu(@Req() req: any, @Query() query: GetPersonalizedMenuDto) {
//     const customerId = req.user?.id;
//     if (!customerId) throw new Error('Customer ID missing from JWT');
//     return this.menuPersonalizationService.getGlobalPersonalizedMenu(customerId, query.limit);
//   }

@UseGuards(JwtAuthGuard)
@ApiBearerAuth('access-token')
@ApiOperation({ summary: 'Get globally personalized menu for the customer' })
@Get('/global')
async getGlobalMenu(@Req() req: any, @Query() query: GetPersonalizedMenuDto) {
  const customerId = req.user?.userId;
  if (!customerId) throw new BadRequestException('Customer ID missing from JWT');
  return this.menuPersonalizationService.getGlobalPersonalizedMenu(customerId, query.limit);
}


  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('access-token')
  @Get('/restaurant/:rid')
  @ApiParam({ name: 'rid', description: 'Restaurant ID' })
  @ApiOperation({ summary: 'Get personalized menu for a specific restaurant based on user history' })
  async getRestaurantMenu(
    @Req() req: any,
    @Param('rid', new ParseUUIDPipe()) restaurantId: string,
    @Query() query: GetPersonalizedMenuDto,
  ) {
    const customerId = req.user?.userId;
    if (!customerId) throw new Error('Customer ID missing from JWT');
    return this.menuPersonalizationService.getPersonalizedRestaurantMenu(customerId, restaurantId, query.limit);
  }
}
