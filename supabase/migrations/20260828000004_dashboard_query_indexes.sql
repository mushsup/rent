-- The dashboard RPC walks these child tables for every tenant. Keep the
-- lookups indexed without changing any financial calculations.
CREATE INDEX IF NOT EXISTS payments_tenant_date_idx
    ON public.payments (tenant_id, payment_date, created_at);

CREATE INDEX IF NOT EXISTS tenants_archive_name_idx
    ON public.tenants (is_archived, name);
