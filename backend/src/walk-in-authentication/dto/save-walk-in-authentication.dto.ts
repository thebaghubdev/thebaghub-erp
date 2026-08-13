import { Type } from 'class-transformer';
import {
  IsArray,
  IsIn,
  IsNumberString,
  IsObject,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  ValidateNested,
} from 'class-validator';

export class WalkInAuthItemSnapshotDto {
  @IsOptional()
  @IsString()
  @MaxLength(255)
  itemModel?: string;

  @IsOptional()
  @IsString()
  @MaxLength(128)
  brand?: string;

  @IsOptional()
  @IsString()
  @MaxLength(128)
  category?: string;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  serialNumber?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(128)
  color?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(128)
  material?: string | null;

  @IsOptional()
  @IsString()
  inclusions?: string | null;
}

export class WalkInAuthDetailsDto {
  @IsOptional()
  @IsString()
  @MaxLength(512)
  dimensions?: string | null;

  @IsOptional()
  @IsNumberString()
  marketPrice?: string | null;

  @IsOptional()
  @IsNumberString()
  retailPrice?: string | null;

  @IsOptional()
  @IsString()
  marketResearchNotes?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(2048)
  marketResearchLink?: string | null;

  @IsOptional()
  @IsString()
  authenticatorNotes?: string | null;
}

export class WalkInAuthMetricEntryDto {
  @IsUUID()
  authenticationMetricId: string;

  @IsOptional()
  @IsString()
  notes?: string | null;

  @IsOptional()
  @IsIn(['pass', 'fail', 'skip'])
  metricStatus?: string | null;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  photos?: string[] | null;
}

export class SaveWalkInAuthenticationDto {
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => WalkInAuthMetricEntryDto)
  rows?: WalkInAuthMetricEntryDto[];

  @IsOptional()
  @ValidateNested()
  @Type(() => WalkInAuthItemSnapshotDto)
  itemSnapshot?: WalkInAuthItemSnapshotDto;

  @IsOptional()
  @ValidateNested()
  @Type(() => WalkInAuthDetailsDto)
  authenticationDetails?: WalkInAuthDetailsDto;

  @IsOptional()
  @IsObject()
  thirdPartyAuthentication?: {
    selectedAuthenticator?: 'LegitGrails' | 'Entrupy' | null;
    certificateLink?: string | null;
    certificatePhotos?: string[] | null;
    notes?: string | null;
  };
}
