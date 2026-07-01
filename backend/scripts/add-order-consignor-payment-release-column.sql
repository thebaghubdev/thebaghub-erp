-- Production: consignor payment release on orders when TypeORM synchronize is disabled.

ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS consignor_payment_release int NULL;
