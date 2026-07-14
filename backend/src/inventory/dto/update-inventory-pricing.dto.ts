import { Allow } from 'class-validator';

export class UpdateInventoryPricingDto {
  /** Decimal string (e.g. `1234.56`) or `null` to clear. */
  @Allow()
  tbhSellingPrice?: string | null;

  /** When true, VIP/program discount logic may apply. */
  @Allow()
  enableDiscount?: boolean;
}
