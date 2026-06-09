import { IsNotEmpty, IsString, MaxLength } from 'class-validator';

export class CancelOrderDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(1000)
  reason: string;
}
