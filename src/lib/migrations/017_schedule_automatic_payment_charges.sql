CREATE EXTENSION IF NOT EXISTS pg_cron WITH SCHEMA extensions;

CREATE OR REPLACE FUNCTION public.ensure_all_tenant_payment_charges()
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    tenant_id UUID;
BEGIN
    FOR tenant_id IN
        SELECT id
        FROM public.tenants
        WHERE COALESCE(is_archived, FALSE) = FALSE
    LOOP
        PERFORM public.ensure_tenant_payment_charges(tenant_id);
    END LOOP;
END;
$$;

REVOKE ALL ON FUNCTION public.ensure_all_tenant_payment_charges() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.ensure_all_tenant_payment_charges() TO postgres;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM cron.job WHERE jobname = 'ensure-weekly-tenant-charges'
    ) THEN
        PERFORM cron.schedule(
            'ensure-weekly-tenant-charges',
            '0 3 * * *',
            'select public.ensure_all_tenant_payment_charges();'
        );
    END IF;
END;
$$;
