CREATE EXTENSION IF NOT EXISTS btree_gist WITH SCHEMA extensions;
SET search_path = public, extensions;

CREATE TABLE public.rental_contracts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    reference TEXT NOT NULL UNIQUE DEFAULT ('R-' || UPPER(SUBSTRING(REPLACE(gen_random_uuid()::TEXT, '-', '') FROM 1 FOR 8))),
    tenant_id UUID REFERENCES public.tenants(id) ON DELETE SET NULL,
    customer_name TEXT NOT NULL CHECK (BTRIM(customer_name) <> ''),
    status TEXT NOT NULL CHECK (status IN ('draft', 'reserved', 'active', 'paused', 'completed', 'cancelled', 'no_show')),
    starts_at TIMESTAMPTZ NOT NULL,
    planned_ends_at TIMESTAMPTZ,
    actual_ends_at TIMESTAMPTZ,
    weekly_rate NUMERIC(12, 2) NOT NULL DEFAULT 0 CHECK (weekly_rate >= 0),
    payment_day INTEGER NOT NULL DEFAULT 1 CHECK (payment_day BETWEEN 1 AND 7),
    deposit_amount NUMERIC(12, 2) NOT NULL DEFAULT 0 CHECK (deposit_amount >= 0),
    currency TEXT NOT NULL DEFAULT 'PLN' CHECK (currency ~ '^[A-Z]{3}$'),
    notes TEXT,
    source TEXT NOT NULL DEFAULT 'beta' CHECK (source IN ('legacy', 'beta', 'public')),
    created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CHECK (planned_ends_at IS NULL OR planned_ends_at > starts_at),
    CHECK (actual_ends_at IS NULL OR actual_ends_at >= starts_at),
    CHECK ((status IN ('completed', 'cancelled', 'no_show')) = (actual_ends_at IS NOT NULL))
);

CREATE UNIQUE INDEX rental_contracts_one_live_per_tenant_idx
    ON public.rental_contracts (tenant_id)
    WHERE tenant_id IS NOT NULL AND status IN ('active', 'paused');
CREATE INDEX rental_contracts_status_start_idx ON public.rental_contracts (status, starts_at);
CREATE INDEX rental_contracts_tenant_idx ON public.rental_contracts (tenant_id, created_at DESC);

CREATE TABLE public.rental_allocations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    contract_id UUID NOT NULL REFERENCES public.rental_contracts(id) ON DELETE CASCADE,
    bike_id UUID REFERENCES public.bikes(id) ON DELETE SET NULL,
    bike_model TEXT NOT NULL CHECK (BTRIM(bike_model) <> ''),
    state TEXT NOT NULL CHECK (state IN ('reserved', 'active', 'completed', 'cancelled')),
    starts_at TIMESTAMPTZ NOT NULL,
    ends_at TIMESTAMPTZ,
    release_buffer INTERVAL NOT NULL DEFAULT INTERVAL '0 minutes' CHECK (release_buffer >= INTERVAL '0 minutes'),
    availability_period TSTZRANGE NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CHECK (ends_at IS NULL OR ends_at > starts_at),
    CHECK (LOWER(availability_period) = starts_at),
    CHECK (LOWER_INC(availability_period) AND NOT UPPER_INC(availability_period)),
    CHECK (
        (ends_at IS NULL AND UPPER_INF(availability_period))
        OR (ends_at IS NOT NULL AND UPPER(availability_period) = ends_at + release_buffer)
    )
);

ALTER TABLE public.rental_allocations
    ADD CONSTRAINT rental_allocations_no_bike_overlap
    EXCLUDE USING gist (
        bike_id WITH =,
        availability_period WITH &&
    ) WHERE (bike_id IS NOT NULL AND state IN ('reserved', 'active'));

CREATE INDEX rental_allocations_contract_idx ON public.rental_allocations (contract_id, starts_at);
CREATE INDEX rental_allocations_bike_idx ON public.rental_allocations (bike_id, starts_at);

CREATE TABLE public.rental_pauses (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    contract_id UUID NOT NULL REFERENCES public.rental_contracts(id) ON DELETE CASCADE,
    starts_at TIMESTAMPTZ NOT NULL,
    ends_at TIMESTAMPTZ,
    billing_mode TEXT NOT NULL CHECK (billing_mode IN ('free', 'reduced', 'full')),
    reduced_weekly_rate NUMERIC(12, 2) CHECK (reduced_weekly_rate >= 0),
    bike_handling TEXT NOT NULL CHECK (bike_handling IN ('kept_by_customer', 'returned')),
    reason TEXT NOT NULL CHECK (BTRIM(reason) <> ''),
    created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CHECK (ends_at IS NULL OR ends_at > starts_at),
    CHECK ((billing_mode = 'reduced') = (reduced_weekly_rate IS NOT NULL))
);

CREATE UNIQUE INDEX rental_pauses_one_open_per_contract_idx
    ON public.rental_pauses (contract_id)
    WHERE ends_at IS NULL;

CREATE TABLE public.bike_availability_blocks (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    bike_id UUID NOT NULL REFERENCES public.bikes(id) ON DELETE CASCADE,
    kind TEXT NOT NULL CHECK (kind IN ('maintenance', 'inspection', 'cleaning', 'manual')),
    status TEXT NOT NULL DEFAULT 'scheduled' CHECK (status IN ('scheduled', 'in_progress', 'completed', 'cancelled')),
    starts_at TIMESTAMPTZ NOT NULL,
    ends_at TIMESTAMPTZ,
    reason TEXT NOT NULL CHECK (BTRIM(reason) <> ''),
    blocks_booking BOOLEAN NOT NULL DEFAULT TRUE,
    created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CHECK (ends_at IS NULL OR ends_at > starts_at)
);

CREATE INDEX bike_availability_blocks_bike_time_idx
    ON public.bike_availability_blocks (bike_id, starts_at, ends_at);

CREATE TABLE public.rental_audit_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    contract_id UUID NOT NULL REFERENCES public.rental_contracts(id) ON DELETE CASCADE,
    event_type TEXT NOT NULL,
    effective_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    details JSONB NOT NULL DEFAULT '{}'::JSONB,
    actor_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    idempotency_key TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (contract_id, idempotency_key)
);

CREATE OR REPLACE FUNCTION public.touch_beta_rental_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
    NEW.updated_at := NOW();
    RETURN NEW;
END;
$$;

CREATE TRIGGER rental_contracts_touch_updated_at
BEFORE UPDATE ON public.rental_contracts
FOR EACH ROW EXECUTE FUNCTION public.touch_beta_rental_updated_at();

CREATE TRIGGER bike_availability_blocks_touch_updated_at
BEFORE UPDATE ON public.bike_availability_blocks
FOR EACH ROW EXECUTE FUNCTION public.touch_beta_rental_updated_at();

-- Mirror current rentals into beta without changing the legacy tables. These
-- contracts are a compatibility baseline and can be managed by beta commands
-- once the operator opts into the new workflow.
INSERT INTO public.rental_contracts (
    tenant_id, customer_name, status, starts_at, weekly_rate, payment_day,
    deposit_amount, source, notes
)
SELECT
    tenant.id,
    tenant.name,
    'active',
    (tenant.accounting_start_date::TIMESTAMP AT TIME ZONE 'Europe/Warsaw'),
    tenant.weekly_payment,
    tenant.payment_day,
    COALESCE(tenant.deposit, 0),
    'legacy',
    'Imported from the active legacy assignment'
FROM public.tenants AS tenant
WHERE tenant.is_archived = FALSE
  AND tenant.bike_id IS NOT NULL
ON CONFLICT DO NOTHING;

INSERT INTO public.rental_allocations (
    contract_id, bike_id, bike_model, state, starts_at, availability_period
)
SELECT
    contract.id,
    bike.id,
    bike.model,
    'active',
    contract.starts_at,
    TSTZRANGE(contract.starts_at, NULL, '[)')
FROM public.rental_contracts AS contract
JOIN public.tenants AS tenant ON tenant.id = contract.tenant_id
JOIN public.bikes AS bike ON bike.id = tenant.bike_id
WHERE contract.status = 'active'
  AND NOT EXISTS (
      SELECT 1 FROM public.rental_allocations AS allocation
      WHERE allocation.contract_id = contract.id AND allocation.state = 'active'
  );

ALTER TABLE public.rental_contracts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.rental_allocations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.rental_pauses ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bike_availability_blocks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.rental_audit_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Administrators can manage rental contracts" ON public.rental_contracts
    FOR ALL TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());
CREATE POLICY "Administrators can manage rental allocations" ON public.rental_allocations
    FOR ALL TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());
CREATE POLICY "Administrators can manage rental pauses" ON public.rental_pauses
    FOR ALL TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());
CREATE POLICY "Administrators can manage bike availability blocks" ON public.bike_availability_blocks
    FOR ALL TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());
CREATE POLICY "Administrators can read rental audit events" ON public.rental_audit_events
    FOR SELECT TO authenticated USING (public.is_admin());

REVOKE ALL ON public.rental_contracts, public.rental_allocations, public.rental_pauses,
    public.bike_availability_blocks, public.rental_audit_events FROM anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.rental_contracts, public.rental_allocations,
    public.rental_pauses, public.bike_availability_blocks TO authenticated;
GRANT SELECT ON public.rental_audit_events TO authenticated;
