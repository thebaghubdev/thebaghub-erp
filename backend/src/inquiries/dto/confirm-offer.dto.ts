import { Type } from 'class-transformer';
import {
  IsIn,
  IsNotEmpty,
  IsOptional,
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
}

/** Offer confirmation uses payment prefs from the client profile; fields are optional for legacy payloads. */
export class ConfirmOfferDto {
  /** Required when CEO approved both a consignment and a direct purchase offer. */
  @IsOptional()
  @IsIn(['consignment', 'direct_purchase'])
  transactionType?: 'consignment' | 'direct_purchase';

  @IsOptional()
  @IsIn(['check_pickup', 'cash_pickup', 'direct_deposit'])
  paymentMethod?: 'check_pickup' | 'cash_pickup' | 'direct_deposit';

  @ValidateIf(
    (o: ConfirmOfferDto) =>
      o.paymentMethod != null && o.paymentMethod !== 'direct_deposit',
  )
  @IsIn(['pasig', 'makati'])
  paymentBranch?: 'pasig' | 'makati';

  @ValidateIf((o: ConfirmOfferDto) => o.paymentMethod === 'direct_deposit')
  @IsNotEmpty()
  @ValidateNested()
  @Type(() => ConfirmOfferBankDetailsDto)
  bankDetails?: ConfirmOfferBankDetailsDto;
}
