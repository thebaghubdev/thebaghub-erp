import { Type } from 'class-transformer';
import {
  IsArray,
  IsIn,
  IsOptional,
  IsString,
  IsUUID,
  ValidateNested,
} from 'class-validator';

export class ItemAuthenticationMetricEntryDto {
  @IsUUID()
  authenticationMetricId: string;

  @IsOptional()
  @IsString()
  notes?: string | null;

  @IsOptional()
  @IsIn(['pass', 'fail', 'skip'])
  metricStatus?: string | null;

  /** Serialized image payloads (e.g. data URLs or storage keys). */
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  photos?: string[] | null;
}

export class SaveItemAuthenticationMetricsDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ItemAuthenticationMetricEntryDto)
  rows: ItemAuthenticationMetricEntryDto[];
}
