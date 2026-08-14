import { Type } from 'class-transformer';
import {
  IsArray,
  IsIn,
  IsInt,
  IsUUID,
  Min,
  ValidateNested,
} from 'class-validator';
import { TASK_PROGRESS, type TaskProgress } from '../task.constants';

export class ReorderTaskItemDto {
  @IsUUID('4')
  id: string;

  @IsIn([...TASK_PROGRESS])
  progress: TaskProgress;

  @IsInt()
  @Min(0)
  sortOrder: number;
}

export class ReorderTasksDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ReorderTaskItemDto)
  items: ReorderTaskItemDto[];
}
