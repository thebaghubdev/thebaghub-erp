-- Production: `item_authentication.reauthentication_notes` when TypeORM synchronize is disabled.
ALTER TABLE item_authentication
  ADD COLUMN IF NOT EXISTS reauthentication_notes TEXT NULL;
