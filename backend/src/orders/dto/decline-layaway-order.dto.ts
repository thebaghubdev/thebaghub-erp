import { IsNotEmpty, IsString, MaxLength } from 'class-validator';

export class DeclineLayawayOrderDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(1000)
  reason: string;
}
