-- Backfill item_authentication for inventory_items that have no row yet.
-- Safe to run multiple times (skips rows that already have item_authentication).
--
-- Requires PostgreSQL 13+ for gen_random_uuid(). On older versions use:
--   CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
-- and replace gen_random_uuid() with uuid_generate_v4().

INSERT INTO item_authentication (
  id,
  inventory_item_id,
  assigned_to_id,
  authentication_status,
  rating,
  authenticator_notes,
  market_research_notes,
  market_research_link,
  market_price,
  retail_price,
  dimensions,
  created_at,
  updated_at,
  created_by_id,
  updated_by_id
)
SELECT
  gen_random_uuid(),
  ii.id,
  NULL,
  'Pending',
  NULL,
  NULL,
  NULL,
  NULL,
  NULL,
  NULL,
  NULL,
  NOW(),
  NOW(),
  NULL,
  NULL
FROM inventory_items ii
WHERE NOT EXISTS (
  SELECT 1
  FROM item_authentication ia
  WHERE ia.inventory_item_id = ii.id
);

-- Optional: verify counts after running
-- SELECT
--   (SELECT COUNT(*) FROM inventory_items) AS inventory_rows,
--   (SELECT COUNT(*) FROM item_authentication) AS item_authentication_rows;
