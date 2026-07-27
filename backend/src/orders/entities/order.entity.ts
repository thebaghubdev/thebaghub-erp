import {
  Column,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { Client } from '../../clients/entities/client.entity';
import { AuditedEntity } from '../../common/entities/audited.entity';
import { Employee } from '../../employees/entities/employee.entity';
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

  @Column({ name: 'assigned_to_id', type: 'uuid', nullable: true })
  assignedToId: string | null;

  @ManyToOne(() => Employee, { onDelete: 'SET NULL', nullable: true })
  @JoinColumn({ name: 'assigned_to_id' })
  assignedTo: Employee | null;

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

  @Column({
    name: 'reservation_payment_proof_uploaded_at',
    type: 'timestamptz',
    nullable: true,
  })
  reservationPaymentProofUploadedAt: Date | null;

  @Column({
    name: 'reservation_payment_proof_uploaded_by_user_id',
    type: 'uuid',
    nullable: true,
  })
  reservationPaymentProofUploadedByUserId: string | null;

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

  @Column({ name: 'consignor_payment_release', type: 'int', nullable: true })
  consignorPaymentRelease: number | null;

  @Column({ name: 'decline_reason', type: 'text', nullable: true })
  declineReason: string | null;

  @Column({
    name: 'pickup_option',
    type: 'varchar',
    length: 32,
    nullable: true,
  })
  pickupOption: string | null;

  @Column({
    name: 'pickup_branch',
    type: 'varchar',
    length: 16,
    nullable: true,
  })
  pickupBranch: string | null;

  @Column({
    name: 'courier_service',
    type: 'varchar',
    length: 32,
    nullable: true,
  })
  courierService: string | null;

  @Column({
    name: 'shipping_fee_care_of',
    type: 'varchar',
    length: 32,
    nullable: true,
  })
  shippingFeeCareOf: string | null;

  @Column({
    name: 'shipping_fee_proof_uploaded_at',
    type: 'timestamptz',
    nullable: true,
  })
  shippingFeeProofUploadedAt: Date | null;

  @Column({
    name: 'shipping_fee_proof_uploaded_by_user_id',
    type: 'uuid',
    nullable: true,
  })
  shippingFeeProofUploadedByUserId: string | null;
}
