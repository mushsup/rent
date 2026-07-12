CREATE TABLE IF NOT EXISTS tenant_payment_terms (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    weekly_payment NUMERIC(10,2) NOT NULL DEFAULT 0 CHECK (weekly_payment >= 0),
    payment_day INTEGER NOT NULL DEFAULT 1 CHECK (payment_day BETWEEN 1 AND 7),
    effective_from DATE NOT NULL,
    effective_to DATE,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    CHECK (effective_to IS NULL OR effective_to >= effective_from)
);

CREATE INDEX IF NOT EXISTS tenant_payment_terms_tenant_date_idx
    ON tenant_payment_terms (tenant_id, effective_from);

ALTER TABLE tenant_payment_terms ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_policies
        WHERE schemaname = 'public'
          AND tablename = 'tenant_payment_terms'
          AND policyname = 'Authenticated admins can manage payment terms'
    ) THEN
        CREATE POLICY "Authenticated admins can manage payment terms"
            ON tenant_payment_terms
            FOR ALL
            TO authenticated
            USING (true)
            WITH CHECK (true);
    END IF;
END;
$$;

INSERT INTO tenant_payment_terms (tenant_id, weekly_payment, payment_day, effective_from)
SELECT
    tenant.id,
    COALESCE(tenant.weekly_payment, 0),
    COALESCE(tenant.payment_day, 1),
    COALESCE(
        (
            SELECT MIN(payment.payment_date) - 7
            FROM payments AS payment
            WHERE payment.tenant_id = tenant.id
        ),
        COALESCE(tenant.next_payment_date - 84, CURRENT_DATE)
    )
FROM tenants AS tenant
WHERE NOT EXISTS (
    SELECT 1
    FROM tenant_payment_terms AS existing_term
    WHERE existing_term.tenant_id = tenant.id
);
