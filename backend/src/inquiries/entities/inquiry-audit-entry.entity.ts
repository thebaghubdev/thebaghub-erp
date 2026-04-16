import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { Inquiry } from './inquiry.entity';

@Entity('inquiry_audit_entries')
export class InquiryAuditEntry {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'inquiry_id', type: 'uuid' })
  inquiryId: string;

  @ManyToOne(() => Inquiry, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'inquiry_id' })
  inquiry: Inquiry;

  /** Human-readable field name (e.g. "Status", "Item: Brand"). */
  @Column({ name: 'property_name', length: 512 })
  propertyName: string;

  @Column({ name: 'from_value', type: 'text', nullable: true })
  fromValue: string | null;

  @Column({ name: 'to_value', type: 'text', nullable: true })
  toValue: string | null;

  @Column({ name: 'updated_by_user_id', type: 'uuid', nullable: true })
  updatedByUserId: string | null;

  /** Display name at time of change (staff name or "Consignor"). */
  @Column({ name: 'updated_by_label', length: 255 })
  updatedByLabel: string;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;
}
