import {
  IsDateString,
  IsEmail,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';

export class RegisterEmployeeDto {
  @IsString()
  @MinLength(3)
  @MaxLength(128)
  username: string;

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

  @IsDateString()
  hireDate: string;

  @IsString()
  @MaxLength(120)
  position: string;
}
