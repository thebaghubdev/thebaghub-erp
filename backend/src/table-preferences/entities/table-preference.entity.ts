import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  Unique,
  UpdateDateColumn,
} from 'typeorm';
import { User } from '../../users/entities/user.entity';

export type TablePreferenceConfig = {
  version: 1;
  columnOrder?: string[];
  columnPinning?: {
    left?: string[];
    right?: string[];
  };
  sorting?: Array<{
    id: string;
    desc: boolean;
  }>;
  columnFilters?: Array<{
    id: string;
    value: unknown;
  }>;
  globalFilter?: string;
  pagination?: {
    pageSize?: number;
  };
};

@Entity('user_table_preferences')
@Unique('UQ_user_table_preferences_user_table', ['userId', 'tableId'])
export class TablePreference {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'user_id', type: 'uuid' })
  userId: string;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id' })
  user: User;

  @Column({ name: 'table_id', length: 120 })
  tableId: string;

  @Column({ type: 'jsonb' })
  config: TablePreferenceConfig;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;
}
