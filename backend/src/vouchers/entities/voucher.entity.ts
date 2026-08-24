import {
  Column,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { AuditedEntity } from '../../common/entities/audited.entity';
import { Client } from '../../clients/entities/client.entity';

@Entity('vouchers')
export class Voucher extends AuditedEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'voucher_number', type: 'int', unique: true, nullable: true })
  voucherNumber: number | null;

  @Column({ name: 'client_id', type: 'uuid' })
  clientId: string;

  @ManyToOne(() => Client, { onDelete: 'RESTRICT', nullable: false })
  @JoinColumn({ name: 'client_id' })
  client: Client;

  @Column({ type: 'numeric', precision: 12, scale: 2 })
  amount: string;

  @Column({ name: 'expiration_date', type: 'date' })
  expirationDate: Date;

  @Column({ type: 'varchar', length: 32 })
  status: string;

  @Column({ type: 'text', nullable: true })
  notes: string | null;
}
