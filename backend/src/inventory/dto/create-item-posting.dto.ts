import {
  Allow,
  IsArray,
  IsDateString,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';

export class CreateItemPostingDto {
  @IsOptional()
  @IsDateString()
  postingDate?: string | null;

  @IsString()
  @MaxLength(255)
  productName!: string;

  @IsArray()
  @IsString({ each: true })
  collections!: string[];

  @IsArray()
  @IsString({ each: true })
  tags!: string[];

  @IsOptional()
  @IsString()
  productDescription?: string | null;

  @Allow()
  selectedPhotosSnapshot!: unknown;
}
