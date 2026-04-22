import {
  IsEmail,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';

export class RegisterClientDto {
  /** Cloudflare Turnstile token; required when `TURNSTILE_SECRET_KEY` is set. */
  @IsOptional()
  @IsString()
  @MaxLength(4096)
  turnstileToken?: string;

  @IsString()
  @MinLength(8)
  @MaxLength(128)
  password: string;

  @IsString()
  @MaxLength(120)
  firstName: string;

  @IsString()
  @MaxLength(120)
  lastName: string;

  @IsEmail()
  @MaxLength(255)
  email: string;

  @IsString()
  @MaxLength(64)
  contactNumber: string;
}
