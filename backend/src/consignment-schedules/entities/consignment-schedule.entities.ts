import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  OneToMany,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { Employee } from '../../employees/entities/employee.entity';
import { Inquiry } from '../../inquiries/entities/inquiry.entity';

@Entity('consignment_schedules')
export class ConsignmentSchedule {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'delivery_date', type: 'timestamptz' })
  deliveryDate: Date;

  @Column({ type: 'varchar', length: 128 })
  status: string;

  @Column({ type: 'varchar', length: 128 })
  type: string;

  /** How items are transferred (options depend on schedule type: delivery vs pullout). */
  @Column({
    name: 'mode_of_transfer',
    type: 'varchar',
    length: 64,
    default: '',
  })
  modeOfTransfer: string;

  /** Branch handling the schedule (e.g. pasig, makati). */
  @Column({ type: 'varchar', length: 32, default: 'pasig' })
  branch: string;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @ManyToOne(() => Employee, { onDelete: 'RESTRICT', nullable: false })
  @JoinColumn({ name: 'created_by_id' })
  createdBy: Employee;

  @OneToMany(() => ConsignmentScheduleItem, (row) => row.consignmentSchedule)
  items: ConsignmentScheduleItem[];
}

@Entity('consignment_schedule_items')
export class ConsignmentScheduleItem {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne(() => ConsignmentSchedule, (s) => s.items, {
    onDelete: 'CASCADE',
    nullable: false,
  })
  @JoinColumn({ name: 'consignment_schedule_id' })
  consignmentSchedule: ConsignmentSchedule;

  @ManyToOne(() => Inquiry, { onDelete: 'CASCADE', nullable: false })
  @JoinColumn({ name: 'inquiry_id' })
  inquiry: Inquiry;
}
