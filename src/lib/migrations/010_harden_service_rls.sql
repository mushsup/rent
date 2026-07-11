ALTER TABLE bikes ENABLE ROW LEVEL SECURITY;
ALTER TABLE credits ENABLE ROW LEVEL SECURITY;
ALTER TABLE credit_transactions ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies
        WHERE schemaname = 'public' AND tablename = 'bikes'
          AND policyname = 'Authenticated admins can manage bikes'
    ) THEN
        CREATE POLICY "Authenticated admins can manage bikes"
            ON bikes FOR ALL TO authenticated
            USING (true) WITH CHECK (true);
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_policies
        WHERE schemaname = 'public' AND tablename = 'credits'
          AND policyname = 'Authenticated admins can manage credits'
    ) THEN
        CREATE POLICY "Authenticated admins can manage credits"
            ON credits FOR ALL TO authenticated
            USING (true) WITH CHECK (true);
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_policies
        WHERE schemaname = 'public' AND tablename = 'credit_transactions'
          AND policyname = 'Authenticated admins can manage credit transactions'
    ) THEN
        CREATE POLICY "Authenticated admins can manage credit transactions"
            ON credit_transactions FOR ALL TO authenticated
            USING (true) WITH CHECK (true);
    END IF;
END;
$$;
