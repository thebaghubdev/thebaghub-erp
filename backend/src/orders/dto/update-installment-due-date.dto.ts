import { IsDateString } from 'class-validator';

export class UpdateInstallmentDueDateDto {
  @IsDateString()
  dueDate: string;
}
