-- Optional: remove walk_in_date if it was added earlier (use created_at instead).
ALTER TABLE inquiries DROP COLUMN IF EXISTS walk_in_date;
