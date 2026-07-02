import {
  Column,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  Unique,
} from 'typeorm';
import { AuditedEntity } from '../../common/entities/audited.entity';
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

  @Column({ name: 'proof_uploaded_at', type: 'timestamptz', nullable: true })
  proofUploadedAt: Date | null;

  @Column({
    name: 'proof_uploaded_by_user_id',
    type: 'uuid',
    nullable: true,
  })
  proofUploadedByUserId: string | null;
}
