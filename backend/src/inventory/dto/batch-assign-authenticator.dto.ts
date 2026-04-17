import { ArrayNotEmpty, IsArray, IsUUID } from 'class-validator';

export class BatchAssignAuthenticatorDto {
  @IsArray()
  @ArrayNotEmpty()
  @IsUUID('4', { each: true })
  inventoryItemIds: string[];

  @IsUUID()
  employeeId: string;
}
