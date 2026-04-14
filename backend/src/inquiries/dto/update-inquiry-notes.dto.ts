import { IsString, MaxLength } from 'class-validator';

export class UpdateInquiryNotesDto {
  @IsString()
  @MaxLength(10_000)
  notes: string;
}
