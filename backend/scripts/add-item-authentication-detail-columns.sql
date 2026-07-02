-- Production: authentication detail columns on item_authentication when TypeORM synchronize is disabled.

ALTER TABLE item_authentication
  ADD COLUMN IF NOT EXISTS rating varchar(128) NULL,
  ADD COLUMN IF NOT EXISTS dimensions varchar(512) NULL,
  ADD COLUMN IF NOT EXISTS market_price numeric(12, 2) NULL,
  ADD COLUMN IF NOT EXISTS retail_price numeric(12, 2) NULL,
  ADD COLUMN IF NOT EXISTS market_research_notes text NULL,
  ADD COLUMN IF NOT EXISTS market_research_link varchar(2048) NULL,
  ADD COLUMN IF NOT EXISTS authenticator_notes text NULL;

-- Backfill from legacy inventory_items.item_snapshot.form (safe to re-run).
UPDATE item_authentication ia
SET
  rating = COALESCE(
    NULLIF(TRIM(ia.rating), ''),
    NULLIF(TRIM(ii.item_snapshot->'form'->>'rating'), '')
  ),
  dimensions = COALESCE(
    NULLIF(TRIM(ia.dimensions), ''),
    NULLIF(TRIM(ii.item_snapshot->'form'->>'dimensions'), '')
  ),
  market_price = COALESCE(
    ia.market_price,
    NULLIF(TRIM(ii.item_snapshot->'form'->>'marketPrice'), '')::numeric
  ),
  retail_price = COALESCE(
    ia.retail_price,
    NULLIF(TRIM(ii.item_snapshot->'form'->>'retailPrice'), '')::numeric
  ),
  market_research_notes = COALESCE(
    NULLIF(TRIM(ia.market_research_notes), ''),
    NULLIF(TRIM(ii.item_snapshot->'form'->>'marketResearchNotes'), '')
  ),
  market_research_link = COALESCE(
    NULLIF(TRIM(ia.market_research_link), ''),
    NULLIF(TRIM(ii.item_snapshot->'form'->>'marketResearchLink'), '')
  ),
  authenticator_notes = COALESCE(
    NULLIF(TRIM(ia.authenticator_notes), ''),
    NULLIF(TRIM(ii.item_snapshot->'form'->>'authenticatorNotes'), '')
  )
FROM inventory_items ii
WHERE ii.id = ia.inventory_item_id
  AND ii.item_snapshot->'form' IS NOT NULL;
