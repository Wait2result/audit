import { Controller, Get, Param, Query } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import {
  sellerListingsQuerySchema,
  uuidSchema,
  type PaginatedResponse,
  type SellerListingDto,
  type SellerProfileDto,
} from '@dagestan/shared';

import { CurrentUser, Public } from '../../common/decorators/index.js';
import type { RequestUser } from '../../common/types/request-user.js';
import { ListingsService } from './listings.service.js';

/**
 * Публичная страница продавца: профиль и его объявления.
 *
 * Отдаёт только разрешённое к показу: имя, аватар, дату регистрации,
 * подтверждённость телефона и счёт объявлений. Телефона, почты, фамилии и
 * адреса здесь нет — связаться с продавцом можно из объявления.
 */
@ApiTags('Продавцы')
@Controller('sellers')
export class SellersController {
  constructor(private readonly listings: ListingsService) {}

  @Get(':id')
  @Public()
  @ApiOperation({ summary: 'Публичный профиль продавца' })
  profile(@Param('id') id: string): Promise<SellerProfileDto> {
    return this.listings.sellerProfile(uuidSchema.parse(id));
  }

  @Get(':id/listings')
  @Public()
  @ApiOperation({ summary: 'Объявления продавца: активные или завершённые (продано, снято)' })
  listingsOf(
    @Param('id') id: string,
    @Query() raw: Record<string, unknown>,
    @CurrentUser() user?: RequestUser,
  ): Promise<PaginatedResponse<SellerListingDto>> {
    return this.listings.sellerListings(
      uuidSchema.parse(id),
      sellerListingsQuerySchema.parse(raw),
      user?.id,
    );
  }
}
