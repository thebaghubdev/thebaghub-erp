import { IsUUID } from 'class-validator';

export class ApplyVoucherDto {
  @IsUUID()
  voucherId: string;
}
