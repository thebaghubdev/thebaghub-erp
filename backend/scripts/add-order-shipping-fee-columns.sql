-- Production: shipping fee columns on orders when TypeORM synchronize is disabled.

ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS shipping_fee_care_of varchar(32) NULL,
  ADD COLUMN IF NOT EXISTS shipping_fee_proof_key varchar(512) NULL,
  ADD COLUMN IF NOT EXISTS shipping_fee_proof_uploaded_at timestamptz NULL,
  ADD COLUMN IF NOT EXISTS shipping_fee_proof_uploaded_by_user_id uuid NULL;
