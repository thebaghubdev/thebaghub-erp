-- Run once on production (TypeORM synchronize is off when NODE_ENV=production).
-- Safe if `client_offer_confirmation` is null for all rows.
ALTER TABLE inquiries DROP COLUMN IF EXISTS client_offer_confirmation;
