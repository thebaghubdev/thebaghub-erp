import {
  Column,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryColumn,
} from 'typeorm';
import { Client } from '../../clients/entities/client.entity';
import { AuditedEntity } from '../../common/entities/audited.entity';
import { InquiryStatus } from '../../enums/inquiry-status.enum';

/** Stored snapshot for the single item on this inquiry row. */
export type InquiryItemImage = { key: string; url: string };

export type InquiryItemSnapshot = {
  clientItemId: string;
  form: Record<string, unknown>;
  images: InquiryItemImage[];
};

/** Shape of offer confirmation payload / API view (payment + optional bank + signature). */
export type ClientOfferConfirmationData = {
  paymentMethod: 'check_pickup' | 'cash_pickup' | 'direct_deposit';
  bankDetails: {
    accountNumber: string;
    accountName: string;
    bank: 'bdo' | 'bpi' | 'other';
    branch: string;
  } | null;
  /** S3 object key for uploaded/drawn signature image. */
  signatureKey?: string;
};

@Entity('inquiries')
export class Inquiry extends AuditedEntity {
  @PrimaryColumn('uuid')
  id: string;

  @Column({ name: 'consignor_id', type: 'uuid' })
  consignorId: string;

  @ManyToOne(() => Client, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'consignor_id' })
  consignor: Client;

  /** e.g. INQ-2026-0413-01 — date + daily sequence (UTC). */
  @Column({ length: 48, unique: true })
  sku: string;

  @Column({
    type: 'enum',
    enum: InquiryStatus,
    default: InquiryStatus.PENDING,
  })
  status: InquiryStatus;

  /** Staff offer: consignment vs direct purchase (requires client consent for direct). */
  @Column({ name: 'offer_transaction_type', type: 'varchar', length: 32, nullable: true })
  offerTransactionType: 'consignment' | 'direct_purchase' | null;

  @Column({ name: 'offer_price', type: 'numeric', precision: 12, scale: 2, nullable: true })
  offerPrice: string | null;

  /** Preferred payment method after the consignor confirms the offer (column storage). */
  @Column({
    name: 'preferred_payment_method',
    type: 'varchar',
    length: 32,
    nullable: true,
  })
  preferredPaymentMethod:
    | 'check_pickup'
    | 'cash_pickup'
    | 'direct_deposit'
    | null;

  /** S3 key for signature image submitted with offer confirmation. */
  @Column({
    name: 'offer_signature_key',
    type: 'varchar',
    length: 512,
    nullable: true,
  })
  offerSignatureKey: string | null;

  /** Internal staff notes (not shown to clients). */
  @Column({ type: 'text', nullable: true })
  notes: string | null;

  /** Created via staff walk-in flow (Create Inquiry tab). */
  @Column({ name: 'is_walk_in', type: 'boolean', default: false })
  isWalkIn: boolean;

  /** Receiving branch when created via walk-in (e.g. Pasig, Makati). */
  @Column({ name: 'walk_in_branch', type: 'varchar', length: 64, nullable: true })
  walkInBranch: string | null;

  /** Calendar date when the consignment contract period starts (no time component). */
  @Column({ name: 'contract_start_date', type: 'date', nullable: true })
  contractStartDate: Date | null;

  /** Calendar date when the consignment contract expires (no time component). */
  @Column({ name: 'contract_expiration_date', type: 'date', nullable: true })
  contractExpirationDate: Date | null;

  /** One line item per inquiry row (form + uploaded image locations). */
  @Column({ type: 'jsonb', name: 'item_snapshot' })
  itemSnapshot: InquiryItemSnapshot;
}
