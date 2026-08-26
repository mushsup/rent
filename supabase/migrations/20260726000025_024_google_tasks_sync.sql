CREATE SEQUENCE IF NOT EXISTS bike_voice_code_seq START WITH 1;

ALTER TABLE bikes
ADD COLUMN IF NOT EXISTS voice_code TEXT;

UPDATE bikes
SET voice_code = 'B-' || LPAD(nextval('bike_voice_code_seq')::TEXT, 3, '0')
WHERE voice_code IS NULL;

ALTER TABLE bikes
ALTER COLUMN voice_code SET DEFAULT ('B-' || LPAD(nextval('bike_voice_code_seq')::TEXT, 3, '0')),
ALTER COLUMN voice_code SET NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS bikes_voice_code_key ON bikes (UPPER(voice_code));

ALTER TABLE bike_tasks
ALTER COLUMN bike_id DROP NOT NULL;

ALTER TABLE bike_tasks
ADD COLUMN IF NOT EXISTS source TEXT NOT NULL DEFAULT 'site'
    CHECK (source IN ('site', 'google_tasks')),
ADD COLUMN IF NOT EXISTS external_id TEXT,
ADD COLUMN IF NOT EXISTS external_list_id TEXT,
ADD COLUMN IF NOT EXISTS external_updated_at TIMESTAMP WITH TIME ZONE,
ADD COLUMN IF NOT EXISTS last_synced_at TIMESTAMP WITH TIME ZONE,
ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMP WITH TIME ZONE;

CREATE UNIQUE INDEX IF NOT EXISTS bike_tasks_google_external_id_key
ON bike_tasks (external_list_id, external_id)
WHERE external_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS bike_tasks_sync_pending_idx
ON bike_tasks (updated_at, last_synced_at)
WHERE deleted_at IS NULL;

CREATE OR REPLACE FUNCTION set_bike_task_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
    IF ROW(
        NEW.bike_id,
        NEW.title,
        NEW.description,
        NEW.status,
        NEW.priority,
        NEW.due_date,
        NEW.deleted_at
    ) IS DISTINCT FROM ROW(
        OLD.bike_id,
        OLD.title,
        OLD.description,
        OLD.status,
        OLD.priority,
        OLD.due_date,
        OLD.deleted_at
    ) THEN
        NEW.updated_at = NOW();
    END IF;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS bike_tasks_set_updated_at ON bike_tasks;
CREATE TRIGGER bike_tasks_set_updated_at
BEFORE UPDATE ON bike_tasks
FOR EACH ROW
EXECUTE FUNCTION set_bike_task_updated_at();
