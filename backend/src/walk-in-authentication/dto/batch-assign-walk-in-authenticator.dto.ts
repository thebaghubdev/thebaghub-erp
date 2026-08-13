import { ArrayNotEmpty, IsArray, IsUUID } from 'class-validator';

export class BatchAssignWalkInAuthenticatorDto {
  @IsArray()
  @ArrayNotEmpty()
  @IsUUID('4', { each: true })
  ids: string[];

  @IsUUID()
  employeeId: string;
}
