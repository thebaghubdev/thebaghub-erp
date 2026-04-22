import { IsEmail, MaxLength } from 'class-validator';

export class ResendClientVerificationDto {
  @IsEmail()
  @MaxLength(255)
  email: string;
}
