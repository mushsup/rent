CREATE TABLE IF NOT EXISTS bike_tasks (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    bike_id UUID NOT NULL REFERENCES bikes(id) ON DELETE CASCADE,
    title TEXT NOT NULL CHECK (length(trim(title)) > 0),
    description TEXT,
    status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'in_progress', 'done')),
    priority TEXT NOT NULL DEFAULT 'normal' CHECK (priority IN ('low', 'normal', 'high')),
    due_date DATE,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    completed_at TIMESTAMP WITH TIME ZONE
);

CREATE INDEX IF NOT EXISTS bike_tasks_bike_status_idx ON bike_tasks (bike_id, status);
CREATE INDEX IF NOT EXISTS bike_tasks_due_date_idx ON bike_tasks (due_date);

ALTER TABLE bike_tasks ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies
        WHERE schemaname = 'public' AND tablename = 'bike_tasks'
          AND policyname = 'Authenticated admins can manage bike tasks'
    ) THEN
        CREATE POLICY "Authenticated admins can manage bike tasks"
            ON bike_tasks FOR ALL TO authenticated
            USING (true) WITH CHECK (true);
    END IF;
END;
$$;
