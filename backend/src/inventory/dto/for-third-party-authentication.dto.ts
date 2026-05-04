import { Transform } from 'class-transformer';
import { IsNotEmpty, IsString, MaxLength } from 'class-validator';

export class ForThirdPartyAuthenticationDto {
  @Transform(({ value }: { value: unknown }): string => {
    if (typeof value === 'string') return value.trim();
    return '';
  })
  @IsString()
  @IsNotEmpty({ message: 'Reasons for re-authentication are required' })
  @MaxLength(20000)
  reauthenticationReasons: string;
}
