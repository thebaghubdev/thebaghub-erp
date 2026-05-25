import {
  Allow,
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
  IsObject,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';

class ColumnPinningDto {
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  @MaxLength(120, { each: true })
  left?: string[];

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  @MaxLength(120, { each: true })
  right?: string[];
}

class SortingDto {
  @IsString()
  @MaxLength(120)
  id: string;

  @IsBoolean()
  desc: boolean;
}

class ColumnFilterDto {
  @IsString()
  @MaxLength(120)
  id: string;

  @Allow()
  value: unknown;
}

class PaginationDto {
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(200)
  pageSize?: number;
}

export class TablePreferenceConfigDto {
  @IsIn([1])
  version: 1;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  @MaxLength(120, { each: true })
  columnOrder?: string[];

  @IsOptional()
  @IsObject()
  @ValidateNested()
  @Type(() => ColumnPinningDto)
  columnPinning?: ColumnPinningDto;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => SortingDto)
  sorting?: SortingDto[];

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ColumnFilterDto)
  columnFilters?: ColumnFilterDto[];

  @IsOptional()
  @IsString()
  @MaxLength(500)
  globalFilter?: string;

  @IsOptional()
  @IsObject()
  @ValidateNested()
  @Type(() => PaginationDto)
  pagination?: PaginationDto;
}

export class UpsertTablePreferenceDto {
  @IsObject()
  @ValidateNested()
  @Type(() => TablePreferenceConfigDto)
  config: TablePreferenceConfigDto;
}
