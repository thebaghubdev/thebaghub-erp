-- Production: receiving branch for walk-in inquiries (when synchronize is disabled).
ALTER TABLE inquiries
  ADD COLUMN IF NOT EXISTS walk_in_branch varchar(64) NULL;
