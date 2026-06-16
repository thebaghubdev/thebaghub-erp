ALTER TYPE inquiries_status_enum ADD VALUE IF NOT EXISTS 'for_contract_renewal';
ALTER TYPE inquiries_status_enum ADD VALUE IF NOT EXISTS 'for_repricing';

ALTER TABLE inquiries
  ADD COLUMN IF NOT EXISTS contract_renewal_requested_price numeric(12, 2);
