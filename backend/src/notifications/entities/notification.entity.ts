import { Column, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';
import { AuditedEntity } from '../../common/entities/audited.entity';

@Entity('notifications')
@Index('idx_notifications_receiver_unread', ['receiverId', 'isRead'])
export class Notification extends AuditedEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'text' })
  message: string;

  @Column({ name: 'is_read', type: 'boolean', default: false })
  isRead: boolean;

  /** `employees.id` — the staff member who sees this row. */
  @Column({ name: 'receiver_id', type: 'uuid' })
  receiverId: string;

  /**
   * When set, the notification was created for all staff with this `employees.position`.
   * Null when targeted by `receiverId` only.
   */
  @Column({
    name: 'receiver_role',
    type: 'varchar',
    length: 120,
    nullable: true,
  })
  receiverRole: string | null;

  /** Optional link for UI (e.g. open inquiry detail). */
  @Column({ name: 'inquiry_id', type: 'uuid', nullable: true })
  inquiryId: string | null;
}
