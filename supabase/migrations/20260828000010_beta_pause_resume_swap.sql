CREATE OR REPLACE FUNCTION public.beta_pause_rental(
    p_contract_id UUID,
    p_bike_handling TEXT,
    p_final_amount NUMERIC,
    p_reason TEXT
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, extensions
AS $$
DECLARE
    contract_row public.rental_contracts%ROWTYPE;
    allocation_row public.rental_allocations%ROWTYPE;
    effective_at TIMESTAMPTZ := NOW();
    effective_date DATE;
BEGIN
    IF p_bike_handling NOT IN ('kept_by_customer', 'returned') THEN RAISE EXCEPTION 'Invalid bike handling'; END IF;
    IF NULLIF(BTRIM(p_reason), '') IS NULL THEN RAISE EXCEPTION 'Pause reason is required'; END IF;
    IF p_bike_handling = 'returned' AND (p_final_amount IS NULL OR p_final_amount < 0) THEN RAISE EXCEPTION 'Final amount is required when bike is returned'; END IF;
    SELECT * INTO contract_row FROM public.rental_contracts WHERE id = p_contract_id FOR UPDATE;
    IF NOT FOUND OR contract_row.status <> 'active' OR contract_row.tenant_id IS NULL THEN RAISE EXCEPTION 'Rental is not active'; END IF;
    SELECT * INTO allocation_row FROM public.rental_allocations
    WHERE contract_id = p_contract_id AND state = 'active' ORDER BY starts_at DESC LIMIT 1 FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'Rental has no active bike'; END IF;

    effective_date := (effective_at AT TIME ZONE 'Europe/Warsaw')::DATE;
    IF p_bike_handling = 'returned' THEN
        PERFORM public.finish_tenant_rental(contract_row.tenant_id, effective_date, p_final_amount, 'Пауза: ' || BTRIM(p_reason));
        UPDATE public.rental_allocations SET state = 'completed', ends_at = effective_at,
            availability_period = TSTZRANGE(starts_at, effective_at + release_buffer, '[)') WHERE id = allocation_row.id;
    END IF;
    UPDATE public.rental_contracts SET status = 'paused' WHERE id = contract_row.id;
    INSERT INTO public.rental_pauses(contract_id, starts_at, billing_mode, bike_handling, reason, created_by)
    VALUES (contract_row.id, effective_at,
        CASE WHEN p_bike_handling = 'returned' THEN 'free' ELSE 'full' END,
        p_bike_handling, BTRIM(p_reason), auth.uid());
    INSERT INTO public.rental_audit_events(contract_id, event_type, effective_at, details, actor_id)
    VALUES (contract_row.id, 'rental_paused', effective_at,
        JSONB_BUILD_OBJECT('bike_handling', p_bike_handling, 'final_amount', p_final_amount, 'reason', BTRIM(p_reason)), auth.uid());
END;
$$;

CREATE OR REPLACE FUNCTION public.beta_resume_rental(p_contract_id UUID, p_bike_id UUID DEFAULT NULL)
RETURNS VOID
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, extensions
AS $$
DECLARE
    contract_row public.rental_contracts%ROWTYPE;
    pause_row public.rental_pauses%ROWTYPE;
    tenant_row public.tenants%ROWTYPE;
    bike_row public.bikes%ROWTYPE;
    effective_at TIMESTAMPTZ := NOW();
    effective_date DATE;
    allocation_end TIMESTAMPTZ;
BEGIN
    SELECT * INTO contract_row FROM public.rental_contracts WHERE id = p_contract_id FOR UPDATE;
    IF NOT FOUND OR contract_row.status <> 'paused' OR contract_row.tenant_id IS NULL THEN RAISE EXCEPTION 'Rental is not paused'; END IF;
    SELECT * INTO pause_row FROM public.rental_pauses WHERE contract_id = p_contract_id AND ends_at IS NULL FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'Open pause not found'; END IF;
    SELECT * INTO tenant_row FROM public.tenants WHERE id = contract_row.tenant_id FOR UPDATE;

    IF pause_row.bike_handling = 'returned' THEN
        IF p_bike_id IS NULL THEN RAISE EXCEPTION 'A bike is required to resume'; END IF;
        SELECT * INTO bike_row FROM public.bikes WHERE id = p_bike_id FOR UPDATE;
        IF NOT FOUND OR bike_row.status <> 'available' OR EXISTS (SELECT 1 FROM public.tenants WHERE bike_id = p_bike_id) THEN RAISE EXCEPTION 'Bike is not available'; END IF;
        allocation_end := CASE WHEN contract_row.planned_ends_at > effective_at THEN contract_row.planned_ends_at ELSE NULL END;
        INSERT INTO public.rental_allocations(contract_id, bike_id, bike_model, state, starts_at, ends_at, availability_period)
        VALUES (contract_row.id, bike_row.id, bike_row.model, 'active', effective_at, allocation_end,
            TSTZRANGE(effective_at, allocation_end, '[)'));
        effective_date := (effective_at AT TIME ZONE 'Europe/Warsaw')::DATE;
        PERFORM public.update_tenant_profile(tenant_row.id, tenant_row.name, tenant_row.slug, bike_row.id,
            contract_row.weekly_rate, contract_row.payment_day, effective_date + 7, contract_row.deposit_amount,
            tenant_row.admin_comment, tenant_row.phone, tenant_row.telegram_username, tenant_row.battery_config,
            tenant_row.discount_amount, effective_date);
    ELSE
        IF tenant_row.bike_id IS NULL THEN RAISE EXCEPTION 'Customer no longer has the retained bike'; END IF;
    END IF;

    UPDATE public.rental_pauses SET ends_at = effective_at WHERE id = pause_row.id;
    UPDATE public.rental_contracts SET status = 'active' WHERE id = contract_row.id;
    INSERT INTO public.rental_audit_events(contract_id, event_type, effective_at, details, actor_id)
    VALUES (contract_row.id, 'rental_resumed', effective_at,
        JSONB_BUILD_OBJECT('bike_id', COALESCE(p_bike_id, tenant_row.bike_id)), auth.uid());
EXCEPTION WHEN exclusion_violation THEN RAISE EXCEPTION 'Bike conflicts with another reservation';
END;
$$;

CREATE OR REPLACE FUNCTION public.beta_swap_bike(p_contract_id UUID, p_new_bike_id UUID, p_reason TEXT)
RETURNS VOID
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, extensions
AS $$
DECLARE
    contract_row public.rental_contracts%ROWTYPE;
    allocation_row public.rental_allocations%ROWTYPE;
    tenant_row public.tenants%ROWTYPE;
    bike_row public.bikes%ROWTYPE;
    effective_at TIMESTAMPTZ := NOW();
    effective_date DATE;
    allocation_end TIMESTAMPTZ;
BEGIN
    IF NULLIF(BTRIM(p_reason), '') IS NULL THEN RAISE EXCEPTION 'Swap reason is required'; END IF;
    SELECT * INTO contract_row FROM public.rental_contracts WHERE id = p_contract_id FOR UPDATE;
    IF NOT FOUND OR contract_row.status <> 'active' OR contract_row.tenant_id IS NULL THEN RAISE EXCEPTION 'Rental is not active'; END IF;
    SELECT * INTO allocation_row FROM public.rental_allocations
    WHERE contract_id = p_contract_id AND state = 'active' ORDER BY starts_at DESC LIMIT 1 FOR UPDATE;
    SELECT * INTO tenant_row FROM public.tenants WHERE id = contract_row.tenant_id FOR UPDATE;
    SELECT * INTO bike_row FROM public.bikes WHERE id = p_new_bike_id FOR UPDATE;
    IF NOT FOUND OR bike_row.status <> 'available' OR EXISTS (SELECT 1 FROM public.tenants WHERE bike_id = p_new_bike_id) THEN RAISE EXCEPTION 'New bike is not available'; END IF;
    IF allocation_row.bike_id = p_new_bike_id THEN RAISE EXCEPTION 'Choose another bike'; END IF;

    UPDATE public.rental_allocations SET state = 'completed', ends_at = effective_at,
        availability_period = TSTZRANGE(starts_at, effective_at + release_buffer, '[)') WHERE id = allocation_row.id;
    allocation_end := CASE WHEN contract_row.planned_ends_at > effective_at THEN contract_row.planned_ends_at ELSE NULL END;
    INSERT INTO public.rental_allocations(contract_id, bike_id, bike_model, state, starts_at, ends_at, availability_period)
    VALUES (contract_row.id, bike_row.id, bike_row.model, 'active', effective_at, allocation_end,
        TSTZRANGE(effective_at, allocation_end, '[)'));
    effective_date := (effective_at AT TIME ZONE 'Europe/Warsaw')::DATE;
    PERFORM public.update_tenant_profile(tenant_row.id, tenant_row.name, tenant_row.slug, bike_row.id,
        contract_row.weekly_rate, contract_row.payment_day, tenant_row.next_payment_date,
        contract_row.deposit_amount, tenant_row.admin_comment, tenant_row.phone,
        tenant_row.telegram_username, tenant_row.battery_config, tenant_row.discount_amount, effective_date);
    INSERT INTO public.rental_audit_events(contract_id, event_type, effective_at, details, actor_id)
    VALUES (contract_row.id, 'bike_swapped', effective_at,
        JSONB_BUILD_OBJECT('old_bike_id', allocation_row.bike_id, 'new_bike_id', bike_row.id, 'reason', BTRIM(p_reason)), auth.uid());
EXCEPTION WHEN exclusion_violation THEN RAISE EXCEPTION 'Bike conflicts with another reservation';
END;
$$;

REVOKE ALL ON FUNCTION public.beta_pause_rental(UUID, TEXT, NUMERIC, TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.beta_resume_rental(UUID, UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.beta_swap_bike(UUID, UUID, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.beta_pause_rental(UUID, TEXT, NUMERIC, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.beta_resume_rental(UUID, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.beta_swap_bike(UUID, UUID, TEXT) TO authenticated;
