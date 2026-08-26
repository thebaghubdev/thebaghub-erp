import {
  Column,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { AuditedEntity } from '../../common/entities/audited.entity';
import { Employee } from '../../employees/entities/employee.entity';
import { ThirdPartyAuthenticationData } from '../../inventory/entities/item-authentication.types';

@Entity('walk_in_authentications')
export class WalkInAuthentication extends AuditedEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', length: 64, unique: true })
  sku: string;

  @Column({ type: 'varchar', length: 32 })
  branch: string;

  @Column({ name: 'first_name', type: 'varchar', length: 120 })
  firstName: string;

  @Column({ name: 'last_name', type: 'varchar', length: 120 })
  lastName: string;

  @Column({ name: 'contact_number', type: 'varchar', length: 64 })
  contactNumber: string;

  @Column({ type: 'varchar', length: 255 })
  email: string;

  @Column({ name: 'item_model', type: 'varchar', length: 255 })
  itemModel: string;

  @Column({ type: 'varchar', length: 128 })
  brand: string;

  @Column({ type: 'varchar', length: 128 })
  category: string;

  @Column({ name: 'serial_number', type: 'varchar', length: 255, nullable: true })
  serialNumber: string | null;

  @Column({ type: 'varchar', length: 128, nullable: true })
  color: string | null;

  @Column({ type: 'varchar', length: 128, nullable: true })
  material: string | null;

  @Column({ type: 'text', nullable: true })
  inclusions: string | null;

  @Column({
    name: 'payment_amount',
    type: 'numeric',
    precision: 12,
    scale: 2,
  })
  paymentAmount: string;

  @Column({
    name: 'payment_status',
    type: 'varchar',
    length: 32,
    default: 'For payment verification',
  })
  paymentStatus: string;

  @Column({ name: 'sales_associate_id', type: 'uuid' })
  salesAssociateId: string;

  @ManyToOne(() => Employee, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'sales_associate_id' })
  salesAssociate: Employee;

  @Column({ name: 'assigned_to_id', type: 'uuid', nullable: true })
  assignedToId: string | null;

  @ManyToOne(() => Employee, { onDelete: 'SET NULL', nullable: true })
  @JoinColumn({ name: 'assigned_to_id' })
  assignedTo: Employee | null;

  @Column({ type: 'varchar', length: 64, default: 'Pending' })
  status: string;

  @Column({ type: 'varchar', length: 64, nullable: true })
  result: string | null;

  @Column({ type: 'varchar', length: 512, nullable: true })
  dimensions: string | null;

  @Column({
    name: 'market_price',
    type: 'numeric',
    precision: 12,
    scale: 2,
    nullable: true,
  })
  marketPrice: string | null;

  @Column({
    name: 'retail_price',
    type: 'numeric',
    precision: 12,
    scale: 2,
    nullable: true,
  })
  retailPrice: string | null;

  @Column({ name: 'market_research_notes', type: 'text', nullable: true })
  marketResearchNotes: string | null;

  @Column({
    name: 'market_research_link',
    type: 'varchar',
    length: 2048,
    nullable: true,
  })
  marketResearchLink: string | null;

  @Column({ name: 'authenticator_notes', type: 'text', nullable: true })
  authenticatorNotes: string | null;

  @Column({
    name: 'third_party_authentication_data',
    type: 'jsonb',
    nullable: true,
  })
  thirdPartyAuthenticationData: ThirdPartyAuthenticationData | null;
}
