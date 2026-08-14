import {
  IsIn,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  MaxLength,
} from 'class-validator';
import { TASK_SEVERITIES, type TaskSeverity } from '../task.constants';

export class CreateTaskDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  title: string;

  @IsOptional()
  @IsString()
  @MaxLength(4000)
  description?: string;

  @IsOptional()
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  dueDate?: string;

  @IsIn([...TASK_SEVERITIES])
  severity: TaskSeverity;

  @IsOptional()
  @IsUUID('4')
  assigneeId?: string;
}
