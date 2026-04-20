-- Production: add inquiry status when TypeORM synchronize is disabled.
-- Default TypeORM PG enum name for `inquiries.status` (run once; fails if value exists).
ALTER TYPE inquiries_status_enum ADD VALUE 'authenticated_new_offer';
