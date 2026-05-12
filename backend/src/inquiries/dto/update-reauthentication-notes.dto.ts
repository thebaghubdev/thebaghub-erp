import { IsString, MaxLength } from 'class-validator';

export class UpdateReauthenticationNotesDto {
  @IsString()
  @MaxLength(20_000)
  notes: string;
}
