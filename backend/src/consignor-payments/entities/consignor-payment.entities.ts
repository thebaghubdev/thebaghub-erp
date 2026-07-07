import {
  Column,
  Entity,
  JoinColumn,
  ManyToOne,
  OneToMany,
  OneToOne,
  PrimaryGeneratedColumn,
  Unique,
} from 'typeorm';
import { Client } from '../../clients/entities/client.entity';
import { Inquiry } from '../../inquiries/entities/inquiry.entity';

@Entity('consignor_payments')
@Unique('UQ_consignor_payments_audit_date', ['auditDate'])
export class ConsignorPayment {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'audit_date', type: 'date' })
  auditDate: Date;

  @Column({ type: 'varchar', length: 128 })
  status: string;

  @OneToMany(() => ConsignorPaymentGroup, (group) => group.consignorPayment)
  groups: ConsignorPaymentGroup[];
}

@Entity('consignor_payments_group')
@Unique('UQ_consignor_payments_group_payment_client', [
  'consignorPaymentsId',
  'clientId',
])
export class ConsignorPaymentGroup {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'client_id', type: 'uuid' })
  clientId: string;

  @ManyToOne(() => Client, { onDelete: 'CASCADE', nullable: false })
  @JoinColumn({ name: 'client_id' })
  client: Client;

  @Column({ name: 'consignor_payments_id', type: 'uuid' })
  consignorPaymentsId: string;

  @ManyToOne(() => ConsignorPayment, (payment) => payment.groups, {
    onDelete: 'CASCADE',
    nullable: false,
  })
  @JoinColumn({ name: 'consignor_payments_id' })
  consignorPayment: ConsignorPayment;

  @OneToMany(() => ConsignorPaymentItem, (item) => item.consignorPaymentGroup)
  items: ConsignorPaymentItem[];
}

@Entity('consignor_payments_item')
export class ConsignorPaymentItem {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'inquiry_id', type: 'uuid', unique: true })
  inquiryId: string;

  @OneToOne(() => Inquiry, { onDelete: 'CASCADE', nullable: false })
  @JoinColumn({ name: 'inquiry_id' })
  inquiry: Inquiry;

  @ManyToOne(() => ConsignorPaymentGroup, (group) => group.items, {
    onDelete: 'CASCADE',
    nullable: false,
  })
  @JoinColumn({ name: 'consignor_payments_group_id' })
  consignorPaymentGroup: ConsignorPaymentGroup;
}
