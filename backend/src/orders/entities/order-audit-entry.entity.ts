import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { Order } from './order.entity';

@Entity('order_audit_entries')
export class OrderAuditEntry {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'order_id', type: 'uuid' })
  orderId: string;

  @ManyToOne(() => Order, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'order_id' })
  order: Order;

  /** Human-readable field name (e.g. "Status", "Installment 2: Amount paid"). */
  @Column({ name: 'property_name', length: 512 })
  propertyName: string;

  @Column({ name: 'from_value', type: 'text', nullable: true })
  fromValue: string | null;

  @Column({ name: 'to_value', type: 'text', nullable: true })
  toValue: string | null;

  @Column({ name: 'updated_by_user_id', type: 'uuid', nullable: true })
  updatedByUserId: string | null;

  /** Display name at time of change (staff name, "Customer", or "System"). */
  @Column({ name: 'updated_by_label', length: 255 })
  updatedByLabel: string;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;
}
