import { Column, Entity, PrimaryGeneratedColumn } from 'typeorm';

@Entity('setting')
export class Setting {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ unique: true, length: 255 })
  key: string;

  @Column({ type: 'text' })
  title: string;

  @Column({ type: 'text', nullable: true })
  description: string | null;

  @Column({ length: 255 })
  category: string;

  @Column({ length: 50 })
  type: string;

  @Column({ type: 'text' })
  value: string;
}
