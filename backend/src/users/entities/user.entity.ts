import { Column, Entity, PrimaryGeneratedColumn } from 'typeorm';
import { AuditedEntity } from '../../common/entities/audited.entity';
import { UserType } from '../../enums/user-type.enum';

@Entity('users')
export class User extends AuditedEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ unique: true, length: 128 })
  username: string;

  @Column({ name: 'password_hash', length: 255 })
  passwordHash: string;

  @Column({ name: 'user_type', type: 'enum', enum: UserType })
  userType: UserType;

  /** Administrator flag (register page, etc.). Distinct from UserType. */
  @Column({ name: 'is_admin', default: false })
  isAdmin: boolean;

  /** Set when the client has confirmed their email (clients only; employees may ignore). */
  @Column({ name: 'email_verified_at', type: 'timestamptz', nullable: true })
  emailVerifiedAt: Date | null;

  @Column({
    name: 'email_verification_token',
    type: 'varchar',
    length: 128,
    nullable: true,
    unique: true,
  })
  emailVerificationToken: string | null;

  @Column({
    name: 'email_verification_expires_at',
    type: 'timestamptz',
    nullable: true,
  })
  emailVerificationExpiresAt: Date | null;
}
