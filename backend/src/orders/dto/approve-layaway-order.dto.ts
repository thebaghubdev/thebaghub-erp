import { IsInt, Min } from 'class-validator';

export class ApproveLayawayOrderDto {
  @IsInt()
  @Min(1)
  consignorPaymentRelease: number;
}
