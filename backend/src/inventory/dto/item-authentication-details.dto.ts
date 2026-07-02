import { IsOptional, IsString, MaxLength } from 'class-validator';

/** Authentication detail fields stored on `item_authentication` (not item snapshot). */
export class ItemAuthenticationDetailsDto {
  @IsOptional()
  @IsString()
  @MaxLength(512)
  dimensions?: string;

  @IsOptional()
  @IsString()
  @MaxLength(128)
  rating?: string;

  @IsOptional()
  @IsString()
  @MaxLength(32)
  marketPrice?: string;

  @IsOptional()
  @IsString()
  @MaxLength(32)
  retailPrice?: string;

  @IsOptional()
  @IsString()
  @MaxLength(8000)
  marketResearchNotes?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2048)
  marketResearchLink?: string;

  @IsOptional()
  @IsString()
  @MaxLength(8000)
  authenticatorNotes?: string;
}
