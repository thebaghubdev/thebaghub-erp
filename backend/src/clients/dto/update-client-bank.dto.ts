import { IsIn, IsOptional, IsString, MaxLength } from 'class-validator';

export class UpdateClientBankDto {
  @IsOptional()
  @IsString()
  @MaxLength(64)
  bankAccountNumber?: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  bankAccountName?: string;

  @IsOptional()
  @IsString()
  @IsIn(['bdo', 'bpi', 'other', ''])
  bankCode?: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  bankBranch?: string;
}
