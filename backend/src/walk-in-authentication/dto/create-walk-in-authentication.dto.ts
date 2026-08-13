import {
  IsEmail,
  IsIn,
  IsNotEmpty,
  IsNumberString,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';
import { WALK_IN_AUTH_BRANCHES } from '../walk-in-authentication.constants';

export class CreateWalkInAuthenticationDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(120)
  firstName: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(120)
  lastName: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(64)
  contactNumber: string;

  @IsEmail()
  @MaxLength(255)
  email: string;

  @IsIn([...WALK_IN_AUTH_BRANCHES])
  branch: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  itemModel: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(128)
  brand: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(128)
  category: string;

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

  /** Decimal string, e.g. "1500.00" */
  @IsNumberString()
  @MinLength(1)
  paymentAmount: string;
}
