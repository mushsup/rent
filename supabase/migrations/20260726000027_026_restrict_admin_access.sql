CREATE TABLE IF NOT EXISTS admin_users (
    user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

-- Preserve access for existing operators. New Auth users are not administrators
-- until their id is explicitly inserted by a database owner.
INSERT INTO admin_users (user_id)
SELECT id FROM auth.users
ON CONFLICT (user_id) DO NOTHING;

ALTER TABLE admin_users ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION is_admin()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT EXISTS (
        SELECT 1 FROM admin_users WHERE user_id = auth.uid()
    );
$$;

REVOKE ALL ON FUNCTION is_admin() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION is_admin() TO authenticated;

DO $$
DECLARE
    table_name TEXT;
    policy RECORD;
BEGIN
    FOREACH table_name IN ARRAY ARRAY[
        'tenants',
        'payments',
        'bikes',
        'credits',
        'credit_transactions',
        'tenant_payment_terms',
        'tenant_payment_charges',
        'tenant_payment_adjustments',
        'bike_tasks'
    ]
    LOOP
        EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', table_name);
        FOR policy IN
            SELECT policyname
            FROM pg_policies
            WHERE schemaname = 'public' AND tablename = table_name
        LOOP
            EXECUTE format('DROP POLICY %I ON %I', policy.policyname, table_name);
        END LOOP;
        EXECUTE format(
            'CREATE POLICY %I ON %I FOR ALL TO authenticated USING (is_admin()) WITH CHECK (is_admin())',
            'Administrators can manage ' || table_name,
            table_name
        );
    END LOOP;
END;
$$;

CREATE POLICY "Administrators can read their membership"
ON admin_users FOR SELECT TO authenticated
USING (user_id = auth.uid() AND is_admin());

REVOKE ALL ON TABLE tenants, payments, bikes, credits, credit_transactions,
    tenant_payment_terms, tenant_payment_charges, tenant_payment_adjustments,
    bike_tasks, admin_users FROM anon;

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE tenants, payments, bikes, credits,
    credit_transactions, tenant_payment_terms, tenant_payment_charges,
    tenant_payment_adjustments, bike_tasks TO authenticated;
GRANT SELECT ON TABLE admin_users TO authenticated;
