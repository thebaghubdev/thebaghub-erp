import { IsString, MaxLength } from 'class-validator';

export class LinkShopifyProductDto {
  @IsString()
  @MaxLength(64)
  shopifyProductId!: string;
}
