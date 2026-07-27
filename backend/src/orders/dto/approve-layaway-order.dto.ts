import { IsInt, IsOptional, Min } from 'class-validator';

export class ApproveLayawayOrderDto {
  @IsOptional()
  @IsInt()
  @Min(1)
  consignorPaymentRelease?: number;
}
