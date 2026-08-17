import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  OneToMany,
  OneToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { Client } from '../../clients/entities/client.entity';
import { Inquiry } from '../../inquiries/entities/inquiry.entity';

@Entity('direct_purchase_payments')
@Index('UQ_direct_purchase_payments_unpaid_client', ['clientId'], {
  unique: true,
  where: `"status" = 'Unpaid'`,
})
export class DirectPurchasePayment {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'client_id', type: 'uuid' })
  clientId: string;

  @ManyToOne(() => Client, { onDelete: 'CASCADE', nullable: false })
  @JoinColumn({ name: 'client_id' })
  client: Client;

  @Column({ type: 'varchar', length: 128, default: 'Unpaid' })
  status: string;

  @Column({ name: 'check_number', type: 'varchar', length: 64, nullable: true })
  checkNumber: string | null;

  @Column({ name: 'unable_to_send_reason', type: 'text', nullable: true })
  unableToSendReason: string | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @OneToMany(
    () => DirectPurchasePaymentItem,
    (item) => item.directPurchasePayment,
  )
  items: DirectPurchasePaymentItem[];
}

@Entity('direct_purchase_payments_item')
export class DirectPurchasePaymentItem {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'inquiry_id', type: 'uuid', unique: true })
  inquiryId: string;

  @OneToOne(() => Inquiry, { onDelete: 'CASCADE', nullable: false })
  @JoinColumn({ name: 'inquiry_id' })
  inquiry: Inquiry;

  @ManyToOne(
    () => DirectPurchasePayment,
    (payment) => payment.items,
    { onDelete: 'CASCADE', nullable: false },
  )
  @JoinColumn({ name: 'direct_purchase_payment_id' })
  directPurchasePayment: DirectPurchasePayment;
}
