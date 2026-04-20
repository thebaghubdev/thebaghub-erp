-- Production: contract date columns on inquiries (when synchronize is disabled).
ALTER TABLE inquiries
  ADD COLUMN IF NOT EXISTS contract_start_date date NULL;

ALTER TABLE inquiries
  ADD COLUMN IF NOT EXISTS contract_expiration_date date NULL;
