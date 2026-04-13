import {
  IsDateString,
  IsEmail,
  IsString,
  MaxLength,
} from 'class-validator';

export class UpdateEmployeeDto {
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
