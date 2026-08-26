CREATE TABLE IF NOT EXISTS tenant_payment_charges (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    due_date DATE NOT NULL,
    amount NUMERIC(10,2) NOT NULL CHECK (amount >= 0),
    comment TEXT,
    status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'waived')),
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    UNIQUE (tenant_id, due_date)
);

CREATE INDEX IF NOT EXISTS tenant_payment_charges_tenant_date_idx
    ON tenant_payment_charges (tenant_id, due_date);

ALTER TABLE tenant_payment_charges ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies
        WHERE schemaname = 'public' AND tablename = 'tenant_payment_charges'
          AND policyname = 'Authenticated admins can manage payment charges'
    ) THEN
        CREATE POLICY "Authenticated admins can manage payment charges"
            ON tenant_payment_charges FOR ALL TO authenticated
            USING (true) WITH CHECK (true);
    END IF;
END;
$$;

CREATE OR REPLACE FUNCTION ensure_tenant_payment_charges(p_tenant_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
    tenant_row tenants%ROWTYPE;
    term_row tenant_payment_terms%ROWTYPE;
    period_start DATE;
    period_end DATE;
    term_end DATE;
BEGIN
    SELECT * INTO tenant_row FROM tenants WHERE id = p_tenant_id;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Tenant not found';
    END IF;

    period_end := GREATEST(
        COALESCE(tenant_row.next_payment_date, CURRENT_DATE),
        CURRENT_DATE + 28
    );

    FOR term_row IN
        SELECT *
        FROM tenant_payment_terms
        WHERE tenant_id = p_tenant_id
        ORDER BY effective_from
    LOOP
        period_start := term_row.effective_from;
        term_end := period_end;
        IF term_row.effective_to IS NOT NULL THEN
            term_end := LEAST(term_end, term_row.effective_to);
        END IF;

        INSERT INTO tenant_payment_charges (tenant_id, due_date, amount)
        SELECT p_tenant_id, due_date::date, term_row.weekly_payment
        FROM generate_series(period_start, term_end, INTERVAL '1 day') AS due_date
        WHERE EXTRACT(ISODOW FROM due_date) = term_row.payment_day
        ON CONFLICT (tenant_id, due_date) DO NOTHING;
    END LOOP;

    IF tenant_row.next_payment_date IS NOT NULL THEN
        INSERT INTO tenant_payment_charges (tenant_id, due_date, amount, comment)
        VALUES (
            p_tenant_id,
            tenant_row.next_payment_date,
            COALESCE(tenant_row.next_payment_amount, tenant_row.weekly_payment, 0),
            tenant_row.next_payment_comment
        )
        ON CONFLICT (tenant_id, due_date) DO UPDATE
        SET amount = EXCLUDED.amount,
            comment = EXCLUDED.comment;
    END IF;
END;
$$;

REVOKE ALL ON FUNCTION ensure_tenant_payment_charges(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION ensure_tenant_payment_charges(UUID) TO authenticated;
