import {
  IsIn,
  IsOptional,
  IsString,
  MaxLength,
  ValidateIf,
} from 'class-validator';

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
  @MaxLength(1000)
  completeAddress?: string;

  @IsOptional()
  @IsIn(['check_pickup', 'cash_pickup', 'direct_deposit'])
  preferredPaymentMethod?: 'check_pickup' | 'cash_pickup' | 'direct_deposit';

  @ValidateIf(
    (o: UpdateClientBankDto) =>
      o.preferredPaymentMethod != null &&
      o.preferredPaymentMethod !== 'direct_deposit',
  )
  @IsIn(['pasig', 'makati'])
  preferredPaymentBranch?: 'pasig' | 'makati';
}
