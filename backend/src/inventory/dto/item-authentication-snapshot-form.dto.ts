import { IsOptional, IsString, MaxLength } from 'class-validator';

/**
 * Fields from the item authentication UI merged into `inventory_items.item_snapshot.form`.
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

  @IsOptional()
  @IsString()
  @MaxLength(512)
  dimensions?: string;

  @IsOptional()
  @IsString()
  @MaxLength(128)
  rating?: string;

  @IsOptional()
  @IsString()
  @MaxLength(32)
  marketPrice?: string;

  @IsOptional()
  @IsString()
  @MaxLength(32)
  retailPrice?: string;

  @IsOptional()
  @IsString()
  @MaxLength(8000)
  marketResearchNotes?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2048)
  marketResearchLink?: string;

  @IsOptional()
  @IsString()
  @MaxLength(8000)
  authenticatorNotes?: string;
}
