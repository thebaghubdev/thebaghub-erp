import { Type } from 'class-transformer';
import {
  ArrayUnique,
  IsArray,
  IsIn,
  IsString,
  IsUUID,
  ValidateNested,
} from 'class-validator';
import { MANAGED_FEATURE_KEYS } from '../feature-keys';

export class FeatureAccessMatrixRowDto {
  @IsString()
  @IsIn([...MANAGED_FEATURE_KEYS])
  featureKey: string;

  @IsArray()
  @ArrayUnique()
  @IsUUID('4', { each: true })
  viewEmployeeIds: string[];

  @IsArray()
  @ArrayUnique()
  @IsUUID('4', { each: true })
  editEmployeeIds: string[];
}

export class UpdateAccessMatrixDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => FeatureAccessMatrixRowDto)
  features: FeatureAccessMatrixRowDto[];
}
