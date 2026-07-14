import {
  Column,
  Entity,
  JoinColumn,
  OneToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { AuditedEntity } from '../../common/entities/audited.entity';
import { User } from '../../users/entities/user.entity';

@Entity('clients')
export class Client extends AuditedEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'user_id', type: 'uuid', unique: true })
  userId: string;

  @OneToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id' })
  user: User;

  @Column({ name: 'first_name', length: 120 })
  firstName: string;

  @Column({ name: 'last_name', length: 120 })
  lastName: string;

  @Column({ length: 255 })
  email: string;

  @Column({ name: 'contact_number', length: 64 })
  contactNumber: string;

  @Column({ name: 'complete_address', type: 'text', nullable: true })
  completeAddress: string | null;

  /** Last bank details submitted when confirming an offer (direct deposit). */
  @Column({
    name: 'bank_account_number',
    type: 'varchar',
    length: 64,
    nullable: true,
  })
  bankAccountNumber: string | null;

  @Column({
    name: 'bank_account_name',
    type: 'varchar',
    length: 200,
    nullable: true,
  })
  bankAccountName: string | null;

  @Column({ name: 'bank_code', type: 'varchar', length: 16, nullable: true })
  bankCode: string | null;

  /** Preferred consignor payout method (check pickup, cash pickup, or direct deposit). */
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

  /** Preferred pickup branch when payment method is check or cash pickup. */
  @Column({
    name: 'preferred_payment_branch',
    type: 'varchar',
    length: 32,
    nullable: true,
  })
  preferredPaymentBranch: 'pasig' | 'makati' | null;

  /** Client draft for the multi-step consignment inquiry form (cleared when an inquiry is submitted). */
  @Column({ name: 'consignment_form_snapshot', type: 'jsonb', nullable: true })
  consignmentFormSnapshot: Record<string, unknown> | null;

  /** VIP tier derived from cumulative purchases and consignments. */
  @Column({
    name: 'vip_status',
    type: 'varchar',
    length: 16,
    nullable: true,
    default: 'Regular',
  })
  vipStatus: 'Regular' | 'Gold' | 'Diamond' | null;

  /** Cumulative consignment value in whole PHP pesos. */
  @Column({ name: 'total_consignments', type: 'int', default: 0 })
  totalConsignments: number;

  /** Cumulative purchase value in whole PHP pesos. */
  @Column({ name: 'total_purchases', type: 'int', default: 0 })
  totalPurchases: number;
}
