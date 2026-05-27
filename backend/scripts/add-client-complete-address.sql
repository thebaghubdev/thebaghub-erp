-- Production: client complete address column when TypeORM synchronize is disabled.

ALTER TABLE clients
  ADD COLUMN IF NOT EXISTS complete_address text NULL;
