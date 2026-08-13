import {
  Column,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  Unique,
} from 'typeorm';
import { AuthenticationMetric } from '../../authentication-metrics/entities/authentication-metric.entity';
import { WalkInAuthentication } from './walk-in-authentication.entity';

@Entity('walk_in_authentication_metrics')
@Unique(['walkInAuthenticationId', 'authenticationMetricId'])
export class WalkInAuthenticationMetric {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'walk_in_authentication_id', type: 'uuid' })
  walkInAuthenticationId: string;

  @ManyToOne(() => WalkInAuthentication, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'walk_in_authentication_id' })
  walkInAuthentication: WalkInAuthentication;

  @Column({ name: 'authentication_metric_id', type: 'uuid' })
  authenticationMetricId: string;

  @ManyToOne(() => AuthenticationMetric, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'authentication_metric_id' })
  authenticationMetric: AuthenticationMetric;

  @Column({ type: 'text', nullable: true })
  notes: string | null;

  @Column({ name: 'metric_status', type: 'varchar', length: 32, nullable: true })
  metricStatus: string | null;
}
