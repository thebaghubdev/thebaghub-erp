import {
  Column,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { AuditedEntity } from '../../common/entities/audited.entity';
import { Employee } from '../../employees/entities/employee.entity';
import type { TaskProgress, TaskSeverity } from '../task.constants';

@Entity('tasks')
@Index('idx_tasks_assignee_progress', ['assigneeId', 'progress'])
export class Task extends AuditedEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'assignee_id', type: 'uuid' })
  assigneeId: string;

  @ManyToOne(() => Employee, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'assignee_id' })
  assignee: Employee;

  @Column({ type: 'varchar', length: 200 })
  title: string;

  @Column({ type: 'text', nullable: true })
  description: string | null;

  @Column({ name: 'due_date', type: 'date', nullable: true })
  dueDate: string | null;

  @Column({ type: 'varchar', length: 16 })
  severity: TaskSeverity;

  @Column({ type: 'varchar', length: 16 })
  progress: TaskProgress;

  @Column({ name: 'sort_order', type: 'int', default: 0 })
  sortOrder: number;
}
