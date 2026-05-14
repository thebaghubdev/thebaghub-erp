-- Enforce one item_photoshoot row per inventory_items row (when TypeORM synchronize is disabled).
-- Run after backing up; removes duplicate photoshoot rows, keeping the earliest date then lexicographic id.

WITH ranked AS (
  SELECT
    id,
    inventory_item_id,
    ROW_NUMBER() OVER (
      PARTITION BY inventory_item_id
      ORDER BY photoshoot_date ASC, id ASC
    ) AS rn
  FROM item_photoshoot
)
DELETE FROM item_photoshoot p
USING ranked r
WHERE p.id = r.id AND r.rn > 1;

CREATE UNIQUE INDEX IF NOT EXISTS uq_item_photoshoot_inventory_item_id
  ON item_photoshoot (inventory_item_id);
