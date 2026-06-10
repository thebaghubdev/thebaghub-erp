ALTER TABLE inquiries
  ADD COLUMN IF NOT EXISTS original_offer_price numeric(12, 2),
  ADD COLUMN IF NOT EXISTS repricing_proof varchar(512);
