import {
  Column,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { AuditedEntity } from '../../common/entities/audited.entity';
import { ORDER_PAYMENT_STATUS_PENDING } from '../order-status.constants';
import { Order } from './order.entity';

@Entity('order_payments')
export class OrderPayment extends AuditedEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'order_id', type: 'uuid' })
  orderId: string;

  @ManyToOne(() => Order, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'order_id' })
  order: Order;

  @Column({
    name: 'amount_paid',
    type: 'numeric',
    precision: 12,
    scale: 2,
    nullable: true,
  })
  amountPaid: string | null;

  @Column({
    name: 'mode_of_payment',
    type: 'varchar',
    length: 32,
    nullable: true,
  })
  modeOfPayment: string | null;

  @Column({
    type: 'varchar',
    length: 32,
    default: ORDER_PAYMENT_STATUS_PENDING,
  })
  status: string;

  @Column({ name: 'proof_uploaded_at', type: 'timestamptz' })
  proofUploadedAt: Date;

  @Column({ name: 'proof_uploaded_by_user_id', type: 'uuid' })
  proofUploadedByUserId: string;

  @Column({ name: 'marked_paid_at', type: 'timestamptz', nullable: true })
  markedPaidAt: Date | null;

  @Column({ name: 'marked_paid_by_user_id', type: 'uuid', nullable: true })
  markedPaidByUserId: string | null;

  @Column({ name: 'payment_date', type: 'date', nullable: true })
  paymentDate: string | null;

  @Column({ name: 'voucher_id', type: 'uuid', nullable: true })
  voucherId: string | null;
}
