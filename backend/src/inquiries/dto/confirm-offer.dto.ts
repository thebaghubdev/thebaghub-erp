import { Type } from 'class-transformer';
import {
  IsIn,
  IsNotEmpty,
  IsString,
  MinLength,
  ValidateIf,
  ValidateNested,
} from 'class-validator';

export class ConfirmOfferBankDetailsDto {
  @IsString()
  @IsNotEmpty()
  @MinLength(1)
  accountNumber: string;

  @IsString()
  @IsNotEmpty()
  @MinLength(1)
  accountName: string;

  @IsIn(['bdo', 'bpi', 'other'])
  bank: 'bdo' | 'bpi' | 'other';

  @IsString()
  @IsNotEmpty()
  @MinLength(1)
  branch: string;
}

export class ConfirmOfferDto {
  @IsIn(['check_pickup', 'cash_pickup', 'direct_deposit'])
  paymentMethod: 'check_pickup' | 'cash_pickup' | 'direct_deposit';

  @ValidateIf((o: ConfirmOfferDto) => o.paymentMethod === 'direct_deposit')
  @IsNotEmpty()
  @ValidateNested()
  @Type(() => ConfirmOfferBankDetailsDto)
  bankDetails?: ConfirmOfferBankDetailsDto;
}
