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

  @Column({ name: 'bank_branch', type: 'varchar', length: 200, nullable: true })
  bankBranch: string | null;

  /** Client draft for the multi-step consignment inquiry form (cleared when an inquiry is submitted). */
  @Column({ name: 'consignment_form_snapshot', type: 'jsonb', nullable: true })
  consignmentFormSnapshot: Record<string, unknown> | null;
}
