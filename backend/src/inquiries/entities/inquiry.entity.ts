import {
  Column,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryColumn,
} from 'typeorm';
import { Client } from '../../clients/entities/client.entity';
import { AuditedEntity } from '../../common/entities/audited.entity';
import { Employee } from '../../employees/entities/employee.entity';
import { AuthenticationReturnCase } from '../../enums/authentication-return-case.enum';
import { InquiryStatus } from '../../enums/inquiry-status.enum';

/** API-facing image reference (resolved from `media` table). */
export type InquiryItemImage = { key: string; url: string };

/** Stored snapshot for the single item on this inquiry row (form only). */
export type InquiryItemSnapshot = {
  clientItemId: string;
  form: Record<string, unknown>;
};

/** Shape of offer confirmation payload / API view (payment + optional bank + signature). */
export type ClientOfferConfirmationData = {
  paymentMethod: 'check_pickup' | 'cash_pickup' | 'direct_deposit';
  paymentBranch: 'pasig' | 'makati' | null;
  bankDetails: {
    accountNumber: string;
    accountName: string;
    bank: 'bdo' | 'bpi' | 'other';
  } | null;
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

  @Column({ name: 'assigned_to_id', type: 'uuid', nullable: true })
  assignedToId: string | null;

  @ManyToOne(() => Employee, { onDelete: 'SET NULL', nullable: true })
  @JoinColumn({ name: 'assigned_to_id' })
  assignedTo: Employee | null;

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

  /** Proposed DP price while awaiting CEO; kept after reject/withdraw. */
  @Column({
    name: 'direct_purchase_requested_price',
    type: 'numeric',
    precision: 12,
    scale: 2,
    nullable: true,
  })
  directPurchaseRequestedPrice: string | null;

  /** Proposed consignment price submitted with a DP approval request. */
  @Column({
    name: 'consignment_requested_price',
    type: 'numeric',
    precision: 12,
    scale: 2,
    nullable: true,
  })
  consignmentRequestedPrice: string | null;

  /** Coordinator notes for the CEO; staff-only; kept after the decision. */
  @Column({ name: 'direct_purchase_approver_notes', type: 'text', nullable: true })
  directPurchaseApproverNotes: string | null;

  /** CEO reject reason; staff-only; not shown to the consignor. */
  @Column({ name: 'direct_purchase_reject_reason', type: 'text', nullable: true })
  directPurchaseRejectReason: string | null;

  /** First offer price before a posted item was sent for repricing. */
  @Column({
    name: 'original_offer_price',
    type: 'numeric',
    precision: 12,
    scale: 2,
    nullable: true,
  })
  originalOfferPrice: string | null;

  /** Requested offer price while a posted item is in contract-renewal review. */
  @Column({
    name: 'contract_renewal_requested_price',
    type: 'numeric',
    precision: 12,
    scale: 2,
    nullable: true,
  })
  contractRenewalRequestedPrice: string | null;

  /** Internal staff notes (not shown to clients). */
  @Column({ type: 'text', nullable: true })
  notes: string | null;

  /** Coordinator reason when declining; shown to the consignor. */
  @Column({ name: 'decline_reason', type: 'text', nullable: true })
  declineReason: string | null;

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

  /**
   * Distinguishes the three authenticator-return cases while inquiry/inventory
   * status is Authenticated - Returned to Coordinator / Consignor.
   */
  @Column({
    name: 'authentication_return_case',
    type: 'varchar',
    length: 64,
    nullable: true,
  })
  authenticationReturnCase: AuthenticationReturnCase | null;

  /** Coordinator narrative when returning the inquiry to the consignor. */
  @Column({ name: 'coordinator_return_reason', type: 'text', nullable: true })
  coordinatorReturnReason: string | null;

  /** 3rd-party authentication fee the consignor must pay (PHP). */
  @Column({
    name: 'third_party_authentication_fee',
    type: 'numeric',
    precision: 12,
    scale: 2,
    nullable: true,
  })
  thirdPartyAuthenticationFee: string | null;

  /** Authenticator return-to-coordinator narrative (issues, flaws, damages, etc.). */
  @Column({ name: 'return_reasons', type: 'text', nullable: true })
  returnReasons: string | null;

  /** Optional suggested price range lower bound (PHP). */
  @Column({
    name: 'price_range_min',
    type: 'numeric',
    precision: 12,
    scale: 2,
    nullable: true,
  })
  priceRangeMin: string | null;

  /** Optional suggested price range upper bound (PHP). */
  @Column({
    name: 'price_range_max',
    type: 'numeric',
    precision: 12,
    scale: 2,
    nullable: true,
  })
  priceRangeMax: string | null;

  /**
   * Authenticator narrative when sending the item for paid 3rd party authentication
   * (in-house re-check / re-authentication path).
   */
  @Column({
    name: 'third_party_reauthentication_reasons',
    type: 'text',
    nullable: true,
  })
  thirdPartyReauthenticationReasons: string | null;

  /** One line item per inquiry row (form fields only; images in `media`). */
  @Column({ type: 'jsonb', name: 'item_snapshot' })
  itemSnapshot: InquiryItemSnapshot;

  /** Early pullout fee charged to consignor (PHP). */
  @Column({
    name: 'pullout_fee',
    type: 'numeric',
    precision: 12,
    scale: 2,
    nullable: true,
  })
  pulloutFee: string | null;

  /** Narrative for why the item is being pulled out early. */
  @Column({ name: 'pullout_reason', type: 'text', nullable: true })
  pulloutReason: string | null;

  /** Pullout fee proof: `For payment verification` until staff confirms. */
  @Column({
    name: 'pullout_payment_status',
    type: 'varchar',
    length: 32,
    nullable: true,
  })
  pulloutPaymentStatus: string | null;

  /** 3rd-party authentication fee proof: `For payment verification` until staff confirms. */
  @Column({
    name: 'third_party_payment_status',
    type: 'varchar',
    length: 32,
    nullable: true,
  })
  thirdPartyPaymentStatus: string | null;
}
