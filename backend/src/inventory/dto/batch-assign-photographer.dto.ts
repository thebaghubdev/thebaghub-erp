import { ArrayNotEmpty, IsArray, IsUUID } from 'class-validator';

export class BatchAssignPhotographerDto {
  @IsArray()
  @ArrayNotEmpty()
  @IsUUID('4', { each: true })
  photoshootIds: string[];

  @IsUUID()
  employeeId: string;
}
