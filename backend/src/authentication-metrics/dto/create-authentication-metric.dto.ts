import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
  ValidateIf,
} from 'class-validator';

export class CreateAuthenticationMetricDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  category: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(500)
  metricCategory: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(500)
  metric: string;

  @IsOptional()
  @IsString()
  description?: string | null;

  @IsBoolean()
  @Type(() => Boolean)
  isCustom: boolean;

  @ValidateIf((o: CreateAuthenticationMetricDto) => o.isCustom === true)
  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  brand?: string | null;

  @ValidateIf((o: CreateAuthenticationMetricDto) => o.isCustom === true)
  @IsOptional()
  @IsString()
  @MaxLength(255)
  model?: string | null;
}
