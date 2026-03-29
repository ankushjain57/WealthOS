-- Run once to support upsert in import script
ALTER TABLE snapshots ADD CONSTRAINT IF NOT EXISTS snapshots_snap_date_unique UNIQUE (snap_date);
