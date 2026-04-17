import {
  Column,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  Unique,
} from 'typeorm';
import { AuthenticationMetric } from '../../authentication-metrics/entities/authentication-metric.entity';
import { ItemAuthentication } from './item-authentication.entity';

@Entity('item_authentication_metrics')
@Unique(['itemAuthenticationId', 'authenticationMetricId'])
export class ItemAuthenticationMetric {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'item_authentication_id', type: 'uuid' })
  itemAuthenticationId: string;

  @ManyToOne(() => ItemAuthentication, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'item_authentication_id' })
  itemAuthentication: ItemAuthentication;

  @Column({ name: 'authentication_metric_id', type: 'uuid' })
  authenticationMetricId: string;

  @ManyToOne(() => AuthenticationMetric, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'authentication_metric_id' })
  authenticationMetric: AuthenticationMetric;

  @Column({ type: 'text', nullable: true })
  notes: string | null;

  /**
   * Serialized photo payloads (e.g. data URLs or S3 keys); stored as JSON array.
   */
  @Column({ type: 'jsonb', nullable: true })
  photos: string[] | null;

  @Column({ name: 'metric_status', type: 'varchar', length: 32, nullable: true })
  metricStatus: string | null;
}
