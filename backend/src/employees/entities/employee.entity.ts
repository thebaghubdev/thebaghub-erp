import {
  Column,
  Entity,
  JoinColumn,
  OneToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { AuditedEntity } from '../../common/entities/audited.entity';
import { User } from '../../users/entities/user.entity';

@Entity('employees')
export class Employee extends AuditedEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'user_id', type: 'uuid', unique: true })
  userId: string;

  @OneToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id' })
  user: User;

  @Column({ name: 'first_name', length: 120 })
  firstName: string;

  @Column({ name: 'last_name', length: 120 })
  lastName: string;

  @Column({ length: 255 })
  email: string;

  @Column({ name: 'contact_number', length: 64 })
  contactNumber: string;

  @Column({ name: 'hire_date', type: 'date' })
  hireDate: Date;

  @Column({ length: 120 })
  position: string;
}
