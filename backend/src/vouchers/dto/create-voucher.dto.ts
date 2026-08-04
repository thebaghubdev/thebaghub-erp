import { IsDateString, IsNotEmpty, IsString, IsUUID } from 'class-validator';

export class CreateVoucherDto {
  @IsUUID()
  clientId: string;

  @IsString()
  @IsNotEmpty()
  amount: string;

  @IsDateString()
  expirationDate: string;
}
