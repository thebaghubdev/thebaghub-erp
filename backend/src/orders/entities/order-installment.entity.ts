import {
  Column,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  Unique,
} from 'typeorm';
import { AuditedEntity } from '../../common/entities/audited.entity';
import { ORDER_INSTALLMENT_STATUS_UNPAID } from '../order-status.constants';
import { Order } from './order.entity';

@Entity('order_installments')
@Unique(['orderId', 'installmentNumber'])
export class OrderInstallment extends AuditedEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'order_id', type: 'uuid' })
  orderId: string;

  @ManyToOne(() => Order, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'order_id' })
  order: Order;

  @Column({ name: 'installment_number', type: 'int' })
  installmentNumber: number;

  @Column({
    name: 'scheduled_amount',
    type: 'numeric',
    precision: 12,
    scale: 2,
  })
  scheduledAmount: string;

  @Column({
    name: 'amount_paid',
    type: 'numeric',
    precision: 12,
    scale: 2,
    nullable: true,
  })
  amountPaid: string | null;

  @Column({
    type: 'varchar',
    length: 32,
    default: ORDER_INSTALLMENT_STATUS_UNPAID,
  })
  status: string;

  @Column({ name: 'marked_paid_at', type: 'timestamptz', nullable: true })
  markedPaidAt: Date | null;

  @Column({ name: 'proof_uploaded_at', type: 'timestamptz', nullable: true })
  proofUploadedAt: Date | null;

  @Column({
    name: 'proof_uploaded_by_user_id',
    type: 'uuid',
    nullable: true,
  })
  proofUploadedByUserId: string | null;
}
