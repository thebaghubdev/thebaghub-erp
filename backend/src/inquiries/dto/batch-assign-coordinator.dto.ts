import { ArrayNotEmpty, IsArray, IsUUID } from 'class-validator';

export class BatchAssignCoordinatorDto {
  @IsArray()
  @ArrayNotEmpty()
  @IsUUID('4', { each: true })
  inquiryIds: string[];

  @IsUUID()
  employeeId: string;
}
