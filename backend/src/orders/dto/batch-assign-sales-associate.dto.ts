import { ArrayNotEmpty, IsArray, IsUUID } from 'class-validator';

export class BatchAssignSalesAssociateDto {
  @IsArray()
  @ArrayNotEmpty()
  @IsUUID('4', { each: true })
  orderIds: string[];

  @IsUUID()
  employeeId: string;
}
