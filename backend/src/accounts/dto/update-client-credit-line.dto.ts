import { IsBoolean } from 'class-validator';

export class UpdateClientCreditLineDto {
  @IsBoolean()
  isCreditLine: boolean;
}
