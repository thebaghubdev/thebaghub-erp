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

/** Submitted by consignor when confirming an offer (stored as JSONB). */
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

  /** Legacy: older rows only — prefer `preferred_payment_method` + `offer_signature_key` + client bank columns. */
  @Column({ type: 'jsonb', name: 'client_offer_confirmation', nullable: true })
  clientOfferConfirmation: ClientOfferConfirmationData | null;

  /** Internal staff notes (not shown to clients). */
  @Column({ type: 'text', nullable: true })
  notes: string | null;

  /** One line item per inquiry row (form + uploaded image locations). */
  @Column({ type: 'jsonb', name: 'item_snapshot' })
  itemSnapshot: InquiryItemSnapshot;
}
