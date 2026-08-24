import {
  IsDateString,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
} from 'class-validator';

export class CreateVoucherDto {
  @IsUUID()
  clientId: string;

  @IsString()
  @IsNotEmpty()
  amount: string;

  @IsDateString()
  expirationDate: string;

  @IsOptional()
  @IsString()
  @MaxLength(10_000)
  notes?: string;
}
