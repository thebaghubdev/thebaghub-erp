-- Production: new photoshoot rows use NULL for photos_snapshot until photos exist.
-- Run when TypeORM synchronize is disabled.

ALTER TABLE item_photoshoot
  ALTER COLUMN photos_snapshot DROP DEFAULT;

ALTER TABLE item_photoshoot
  ALTER COLUMN photos_snapshot DROP NOT NULL;
