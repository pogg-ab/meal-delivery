// src/modules/promos/dtos/update-promo.dto.ts
// import { PartialType } from '@nestjs/mapped-types';
// import { CreatePromoDto } from './create-promo.dto';

// export class UpdatePromoDto extends PartialType(CreatePromoDto) {}


// src/modules/promos/dtos/update-promo.dto.ts
import { PartialType } from '@nestjs/mapped-types';
import { CreatePromoDto } from './create-promo.dto';
export class UpdatePromoDto extends PartialType(CreatePromoDto) {}
