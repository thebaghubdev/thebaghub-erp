import { IsString, MaxLength } from 'class-validator';

/** Fields collected in the staff “review item details” modal before receive. */
export class ReceiveItemFormDto {
  @IsString()
  @MaxLength(500)
  itemModel: string;

  @IsString()
  @MaxLength(200)
  brand: string;

  @IsString()
  @MaxLength(200)
  category: string;

  @IsString()
  @MaxLength(200)
  serialNumber: string;

  @IsString()
  @MaxLength(200)
  color: string;

  @IsString()
  @MaxLength(200)
  material: string;

  @IsString()
  @MaxLength(500)
  condition: string;

  @IsString()
  @MaxLength(4000)
  inclusions: string;

  /** YYYY-MM-DD or empty */
  @IsString()
  @MaxLength(32)
  datePurchased: string;

  @IsString()
  @MaxLength(500)
  sourceOfPurchase: string;
}
