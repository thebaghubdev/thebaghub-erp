import { Column, Entity, PrimaryGeneratedColumn } from 'typeorm';
import { AuditedEntity } from '../../common/entities/audited.entity';

@Entity('inquiries')
export class Inquiry extends AuditedEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ length: 255 })
  subject: string;

  @Column({ length: 32, default: 'open' })
  status: string;
}
