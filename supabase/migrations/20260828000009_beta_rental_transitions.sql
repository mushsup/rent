CREATE OR REPLACE FUNCTION public.beta_activate_reservation(p_contract_id UUID)
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
BEGIN
    SELECT * INTO contract_row FROM public.rental_contracts WHERE id = p_contract_id FOR UPDATE;
    IF NOT FOUND OR contract_row.status <> 'reserved' THEN RAISE EXCEPTION 'Reservation is not available for pickup'; END IF;
    IF contract_row.starts_at > NOW() + INTERVAL '12 hours' THEN RAISE EXCEPTION 'Reservation cannot be issued more than 12 hours early'; END IF;

    SELECT * INTO allocation_row FROM public.rental_allocations
    WHERE contract_id = p_contract_id AND state = 'reserved' ORDER BY starts_at LIMIT 1 FOR UPDATE;
    IF NOT FOUND OR allocation_row.bike_id IS NULL THEN RAISE EXCEPTION 'Reservation has no assigned bike'; END IF;
    SELECT * INTO tenant_row FROM public.tenants WHERE id = contract_row.tenant_id FOR UPDATE;
    SELECT * INTO bike_row FROM public.bikes WHERE id = allocation_row.bike_id FOR UPDATE;
    IF tenant_row.is_archived OR tenant_row.bike_id IS NOT NULL THEN RAISE EXCEPTION 'Customer cannot start this rental'; END IF;
    IF bike_row.status <> 'available' OR EXISTS (SELECT 1 FROM public.tenants WHERE bike_id = bike_row.id) THEN RAISE EXCEPTION 'Bike is not available'; END IF;

    effective_date := (effective_at AT TIME ZONE 'Europe/Warsaw')::DATE;
    UPDATE public.rental_allocations SET state = 'active', starts_at = effective_at,
        availability_period = TSTZRANGE(effective_at, CASE WHEN ends_at IS NULL THEN NULL ELSE ends_at + release_buffer END, '[)')
    WHERE id = allocation_row.id;
    UPDATE public.rental_contracts SET status = 'active', starts_at = effective_at WHERE id = contract_row.id;
    PERFORM public.update_tenant_profile(tenant_row.id, tenant_row.name, tenant_row.slug, bike_row.id,
        contract_row.weekly_rate, contract_row.payment_day, effective_date + 7, contract_row.deposit_amount,
        tenant_row.admin_comment, tenant_row.phone, tenant_row.telegram_username, tenant_row.battery_config, 0, effective_date);
    INSERT INTO public.rental_audit_events(contract_id, event_type, effective_at, details, actor_id)
    VALUES (contract_row.id, 'reservation_picked_up', effective_at, JSONB_BUILD_OBJECT('bike_id', bike_row.id), auth.uid());
END;
$$;

CREATE OR REPLACE FUNCTION public.beta_cancel_reservation(p_contract_id UUID, p_reason TEXT, p_no_show BOOLEAN DEFAULT FALSE)
RETURNS VOID
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE contract_row public.rental_contracts%ROWTYPE;
BEGIN
    IF NULLIF(BTRIM(p_reason), '') IS NULL THEN RAISE EXCEPTION 'Cancellation reason is required'; END IF;
    SELECT * INTO contract_row FROM public.rental_contracts WHERE id = p_contract_id FOR UPDATE;
    IF NOT FOUND OR contract_row.status <> 'reserved' THEN RAISE EXCEPTION 'Only a reservation can be cancelled'; END IF;
    UPDATE public.rental_allocations SET state = 'cancelled' WHERE contract_id = p_contract_id AND state = 'reserved';
    UPDATE public.rental_contracts SET status = CASE WHEN p_no_show THEN 'no_show' ELSE 'cancelled' END,
        actual_ends_at = NOW(), notes = CONCAT_WS(E'\n', notes, 'Отмена: ' || BTRIM(p_reason)) WHERE id = p_contract_id;
    INSERT INTO public.rental_audit_events(contract_id, event_type, details, actor_id)
    VALUES (p_contract_id, CASE WHEN p_no_show THEN 'reservation_no_show' ELSE 'reservation_cancelled' END,
        JSONB_BUILD_OBJECT('reason', BTRIM(p_reason)), auth.uid());
END;
$$;

CREATE OR REPLACE FUNCTION public.beta_finish_rental(p_contract_id UUID, p_final_amount NUMERIC, p_reason TEXT)
RETURNS VOID
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
    contract_row public.rental_contracts%ROWTYPE;
    allocation_row public.rental_allocations%ROWTYPE;
    effective_at TIMESTAMPTZ := NOW();
    effective_date DATE;
BEGIN
    IF p_final_amount IS NULL OR p_final_amount < 0 THEN RAISE EXCEPTION 'Final amount must not be negative'; END IF;
    IF NULLIF(BTRIM(p_reason), '') IS NULL THEN RAISE EXCEPTION 'Rental end reason is required'; END IF;
    SELECT * INTO contract_row FROM public.rental_contracts WHERE id = p_contract_id FOR UPDATE;
    IF NOT FOUND OR contract_row.status <> 'active' OR contract_row.tenant_id IS NULL THEN RAISE EXCEPTION 'Rental is not active'; END IF;
    SELECT * INTO allocation_row FROM public.rental_allocations
    WHERE contract_id = p_contract_id AND state = 'active' ORDER BY starts_at DESC LIMIT 1 FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'Rental has no active bike allocation'; END IF;
    effective_date := (effective_at AT TIME ZONE 'Europe/Warsaw')::DATE;
    PERFORM public.finish_tenant_rental(contract_row.tenant_id, effective_date, p_final_amount, BTRIM(p_reason));
    UPDATE public.rental_allocations SET state = 'completed', ends_at = effective_at,
        availability_period = TSTZRANGE(starts_at, effective_at + release_buffer, '[)') WHERE id = allocation_row.id;
    UPDATE public.rental_contracts SET status = 'completed', actual_ends_at = effective_at WHERE id = contract_row.id;
    INSERT INTO public.rental_audit_events(contract_id, event_type, effective_at, details, actor_id)
    VALUES (p_contract_id, 'rental_completed', effective_at,
        JSONB_BUILD_OBJECT('final_amount', p_final_amount, 'reason', BTRIM(p_reason), 'bike_id', allocation_row.bike_id), auth.uid());
END;
$$;

REVOKE ALL ON FUNCTION public.beta_activate_reservation(UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.beta_cancel_reservation(UUID, TEXT, BOOLEAN) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.beta_finish_rental(UUID, NUMERIC, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.beta_activate_reservation(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.beta_cancel_reservation(UUID, TEXT, BOOLEAN) TO authenticated;
GRANT EXECUTE ON FUNCTION public.beta_finish_rental(UUID, NUMERIC, TEXT) TO authenticated;
