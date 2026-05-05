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

  @Column({
    name: 'third_party_authentication_data',
    type: 'jsonb',
    nullable: true,
  })
  thirdPartyAuthenticationData: ThirdPartyAuthenticationData | null;
}
