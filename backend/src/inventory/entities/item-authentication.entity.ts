import {
  Column,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { AuditedEntity } from '../../common/entities/audited.entity';
import { Employee } from '../../employees/entities/employee.entity';
import { InventoryItem } from './inventory-item.entity';

export type ThirdPartyAuthenticationData = {
  selectedAuthenticator: 'LegitGrails' | 'Entrupy' | null;
  certificateLink: string | null;
  certificatePhotos: string[];
  notes: string | null;
};

@Entity('item_authentication')
export class ItemAuthentication extends AuditedEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'inventory_item_id', type: 'uuid' })
  inventoryItemId: string;

  @ManyToOne(() => InventoryItem, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'inventory_item_id' })
  inventoryItem: InventoryItem;

  @Column({ name: 'assigned_to_id', type: 'uuid', nullable: true })
  assignedToId: string | null;

  @ManyToOne(() => Employee, { onDelete: 'SET NULL', nullable: true })
  @JoinColumn({ name: 'assigned_to_id' })
  assignedTo: Employee | null;

  @Column({
    name: 'authentication_status',
    type: 'varchar',
    length: 64,
    default: 'Pending',
  })
  authenticationStatus: string;

  @Column({ type: 'varchar', length: 128, nullable: true })
  rating: string | null;

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

  /**
   * Staff-facing notes for the consignor during third-party reauthentication
   * (fee / external auth handoff). Distinct from third-party certificate notes in JSON.
   */
  @Column({ name: 'reauthentication_notes', type: 'text', nullable: true })
  reauthenticationNotes: string | null;
}
