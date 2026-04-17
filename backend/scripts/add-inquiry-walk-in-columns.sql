-- Production: add walk-in flag if synchronize is disabled.
ALTER TABLE inquiries
  ADD COLUMN IF NOT EXISTS is_walk_in boolean NOT NULL DEFAULT false;
