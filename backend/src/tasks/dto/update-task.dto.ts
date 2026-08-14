import {
  IsIn,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  Min,
  ValidateIf,
} from 'class-validator';
import {
  TASK_PROGRESS,
  TASK_SEVERITIES,
  type TaskProgress,
  type TaskSeverity,
} from '../task.constants';

export class UpdateTaskDto {
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  title?: string;

  @IsOptional()
  @ValidateIf((_, v) => v !== null)
  @IsString()
  @MaxLength(4000)
  description?: string | null;

  @IsOptional()
  @ValidateIf((_, v) => v !== null)
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  dueDate?: string | null;

  @IsOptional()
  @IsIn([...TASK_SEVERITIES])
  severity?: TaskSeverity;

  @IsOptional()
  @IsIn([...TASK_PROGRESS])
  progress?: TaskProgress;

  @IsOptional()
  @IsInt()
  @Min(0)
  sortOrder?: number;
}
