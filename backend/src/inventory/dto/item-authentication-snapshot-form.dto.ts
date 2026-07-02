import { IsOptional, IsString, MaxLength } from 'class-validator';

/**
 * Item identity fields from the authentication UI merged into `inventory_items.item_snapshot.form`.
 */
export class ItemAuthenticationSnapshotFormDto {
  @IsOptional()
  @IsString()
  @MaxLength(512)
  itemModel?: string;

  @IsOptional()
  @IsString()
  @MaxLength(256)
  brand?: string;

  @IsOptional()
  @IsString()
  @MaxLength(256)
  category?: string;

  @IsOptional()
  @IsString()
  @MaxLength(256)
  serialNumber?: string;

  @IsOptional()
  @IsString()
  @MaxLength(256)
  color?: string;

  @IsOptional()
  @IsString()
  @MaxLength(256)
  material?: string;

  @IsOptional()
  @IsString()
  @MaxLength(8000)
  inclusions?: string;
}
