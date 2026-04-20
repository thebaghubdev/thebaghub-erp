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
}
