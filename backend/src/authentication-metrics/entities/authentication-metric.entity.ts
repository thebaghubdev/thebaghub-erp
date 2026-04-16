import {
  Column,
  DeleteDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
} from 'typeorm';

@Entity({
  name: 'authentication_metrics',
  comment: 'Master checklist for item authentication metrics.',
})
@Index('idx_authentication_metrics_category', ['category'])
export class AuthenticationMetric {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ length: 255 })
  category: string;

  @Column({ name: 'metric_category', length: 500 })
  metricCategory: string;

  @Column({ length: 500 })
  metric: string;

  @Column({ type: 'text', nullable: true })
  description: string | null;

  @Column({ name: 'is_custom', type: 'boolean', default: false })
  isCustom: boolean;

  @Column({ type: 'varchar', length: 255, nullable: true })
  brand: string | null;

  @Column({ type: 'varchar', length: 255, nullable: true })
  model: string | null;

  @DeleteDateColumn({ name: 'deleted_at', type: 'timestamptz' })
  deletedAt: Date | null;
}
