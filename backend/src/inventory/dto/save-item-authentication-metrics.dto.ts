import { Type } from 'class-transformer';
import {
  IsArray,
  IsIn,
  IsObject,
  IsOptional,
  IsString,
  IsUUID,
  ValidateNested,
} from 'class-validator';
import { ItemAuthenticationSnapshotFormDto } from './item-authentication-snapshot-form.dto';

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

  /** When set, merged into `inventory_items.item_snapshot.form` for this item. */
  @IsOptional()
  @ValidateNested()
  @Type(() => ItemAuthenticationSnapshotFormDto)
  itemSnapshotForm?: ItemAuthenticationSnapshotFormDto;

  @IsOptional()
  @IsObject()
  thirdPartyAuthentication?: {
    selectedAuthenticator?: 'LegitGrails' | 'Entrupy' | null;
    certificateLink?: string | null;
    certificatePhotos?: string[] | null;
    notes?: string | null;
  };
}
