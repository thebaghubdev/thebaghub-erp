import {
  Column,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  Unique,
} from 'typeorm';
import { AuditedEntity } from '../../common/entities/audited.entity';
import { Employee } from '../../employees/entities/employee.entity';
import { AccessLevel } from '../access-level.enum';

@Entity('feature_access')
@Unique(['featureKey', 'employeeId'])
export class FeatureAccess extends AuditedEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index()
  @Column({ name: 'feature_key', length: 64 })
  featureKey: string;

  @Column({ name: 'employee_id', type: 'uuid' })
  employeeId: string;

  @ManyToOne(() => Employee, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'employee_id' })
  employee: Employee;

  @Column({
    name: 'access_level',
    type: 'enum',
    enum: AccessLevel,
  })
  accessLevel: AccessLevel;
}
