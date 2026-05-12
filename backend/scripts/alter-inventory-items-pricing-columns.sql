-- Use when TypeORM synchronize is disabled (production).
-- Moves TBH pricing fields from deprecated `item_pricing` onto `inventory_items`,
-- then drops `item_pricing`.

ALTER TABLE inventory_items
  ADD COLUMN IF NOT EXISTS tbh_selling_price numeric(12, 2) NULL,
  ADD COLUMN IF NOT EXISTS enable_discount boolean NOT NULL DEFAULT false;

DO $$
BEGIN
  IF to_regclass('public.item_pricing') IS NOT NULL THEN
    UPDATE inventory_items AS i
    SET
      tbh_selling_price = p.tbh_selling_price,
      enable_discount = p.enable_discount
    FROM item_pricing AS p
    WHERE p.inventory_item_id = i.id;

    DROP TABLE item_pricing;
  END IF;
END $$;
