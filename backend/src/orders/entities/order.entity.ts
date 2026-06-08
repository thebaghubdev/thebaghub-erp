import {
  Column,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { Client } from '../../clients/entities/client.entity';
import { AuditedEntity } from '../../common/entities/audited.entity';
import { InventoryItem } from '../../inventory/entities/inventory-item.entity';

@Entity('orders')
export class Order extends AuditedEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'order_number', type: 'int', unique: true })
  orderNumber: number;

  @Column({ type: 'varchar', length: 64 })
  status: string;

  @Column({ name: 'inventory_item_id', type: 'uuid' })
  inventoryItemId: string;

  @ManyToOne(() => InventoryItem, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'inventory_item_id' })
  inventoryItem: InventoryItem;

  @Column({ name: 'customer_id', type: 'uuid' })
  customerId: string;

  @ManyToOne(() => Client, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'customer_id' })
  customer: Client;

  @Column({ name: 'payment_type', type: 'varchar', length: 32 })
  paymentType: string;

  @Column({ name: 'layaway_months', type: 'int', nullable: true })
  layawayMonths: number | null;

  @Column({
    name: 'layaway_price',
    type: 'numeric',
    precision: 12,
    scale: 2,
    nullable: true,
  })
  layawayPrice: string | null;

  @Column({
    name: 'layaway_monthly_payment',
    type: 'numeric',
    precision: 12,
    scale: 2,
    nullable: true,
  })
  layawayMonthlyPayment: string | null;

  @Column({
    name: 'full_payment_price',
    type: 'numeric',
    precision: 12,
    scale: 2,
    nullable: true,
  })
  fullPaymentPrice: string | null;

  @Column({ name: 'signature_key', type: 'varchar', length: 512, nullable: true })
  signatureKey: string | null;

  @Column({
    name: 'full_payment_proof_key',
    type: 'varchar',
    length: 512,
    nullable: true,
  })
  fullPaymentProofKey: string | null;

  @Column({
    name: 'full_payment_proof_uploaded_at',
    type: 'timestamptz',
    nullable: true,
  })
  fullPaymentProofUploadedAt: Date | null;

  @Column({
    name: 'full_payment_proof_uploaded_by_user_id',
    type: 'uuid',
    nullable: true,
  })
  fullPaymentProofUploadedByUserId: string | null;

  @Column({ name: 'holding_period', type: 'timestamptz', nullable: true })
  holdingPeriod: Date | null;

  @Column({ name: 'layaway_payment_start_date', type: 'date', nullable: true })
  layawayPaymentStartDate: string | null;
}
