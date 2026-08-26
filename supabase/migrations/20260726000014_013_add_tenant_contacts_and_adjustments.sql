ALTER TABLE tenants
ADD COLUMN IF NOT EXISTS phone TEXT,
ADD COLUMN IF NOT EXISTS telegram_username TEXT;

CREATE TABLE IF NOT EXISTS tenant_payment_adjustments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    direction TEXT NOT NULL CHECK (direction IN ('charge', 'credit')),
    amount NUMERIC(10,2) NOT NULL CHECK (amount > 0),
    adjustment_date DATE NOT NULL,
    comment TEXT NOT NULL CHECK (BTRIM(comment) <> ''),
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS tenant_payment_adjustments_tenant_date_idx
    ON tenant_payment_adjustments (tenant_id, adjustment_date);

ALTER TABLE tenant_payment_adjustments ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_policies
        WHERE schemaname = 'public'
          AND tablename = 'tenant_payment_adjustments'
          AND policyname = 'Authenticated admins can manage payment adjustments'
    ) THEN
        CREATE POLICY "Authenticated admins can manage payment adjustments"
            ON tenant_payment_adjustments
            FOR ALL
            TO authenticated
            USING (true)
            WITH CHECK (true);
    END IF;
END;
$$;
