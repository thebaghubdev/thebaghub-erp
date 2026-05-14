import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

@Entity('shopify_shop_sessions')
export class ShopifyShopSession {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'shop_domain', unique: true, length: 255 })
  shopDomain: string;

  @Column({ name: 'access_token', type: 'text' })
  accessToken: string;

  @Column({ type: 'text', nullable: true })
  scope: string | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;
}
