-- Public and administrator statements must be calculated from the same
-- accounting facts. The former projection omitted balance_override.
CREATE OR REPLACE FUNCTION public.get_public_tenant_profile(p_slug TEXT)
RETURNS JSONB
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT jsonb_build_object(
        'id', tenant.id,
        'name', tenant.name,
        'slug', tenant.slug,
        'bike_id', tenant.bike_id,
        'weekly_payment', tenant.weekly_payment,
        'discount_amount', tenant.discount_amount,
        'payment_day', tenant.payment_day,
        'next_payment_date', tenant.next_payment_date,
        'next_payment_amount', tenant.next_payment_amount,
        'next_payment_comment', tenant.next_payment_comment,
        'accounting_start_date', tenant.accounting_start_date,
        'opening_balance', tenant.opening_balance,
        'bikes', CASE WHEN bike.id IS NULL THEN NULL ELSE jsonb_build_object(
            'id', bike.id, 'model', bike.model, 'type', bike.type
        ) END,
        'payments', COALESCE((
            SELECT jsonb_agg(jsonb_build_object(
                'id', payment.id, 'amount', payment.amount,
                'payment_date', payment.payment_date, 'created_at', payment.created_at
            ) ORDER BY payment.payment_date, payment.id)
            FROM public.payments AS payment WHERE payment.tenant_id = tenant.id
        ), '[]'::jsonb),
        'payment_charges', COALESCE((
            SELECT jsonb_agg(jsonb_build_object(
                'id', charge.id, 'due_date', charge.due_date,
                'period_start', charge.period_start, 'period_end', charge.period_end,
                'amount', charge.amount, 'breakdown', charge.breakdown,
                'comment', charge.comment, 'status', charge.status,
                'is_automatic', charge.is_automatic, 'approved_at', charge.approved_at,
                'created_at', charge.created_at
            ) ORDER BY charge.due_date, charge.id)
            FROM public.tenant_payment_charges AS charge WHERE charge.tenant_id = tenant.id
        ), '[]'::jsonb),
        'payment_adjustments', COALESCE((
            SELECT jsonb_agg(jsonb_build_object(
                'id', adjustment.id, 'direction', adjustment.direction,
                'amount', adjustment.amount, 'balance_override', adjustment.balance_override,
                'adjustment_date', adjustment.adjustment_date, 'comment', adjustment.comment,
                'source_event_id', adjustment.source_event_id, 'created_at', adjustment.created_at
            ) ORDER BY adjustment.adjustment_date, adjustment.id)
            FROM public.tenant_payment_adjustments AS adjustment WHERE adjustment.tenant_id = tenant.id
        ), '[]'::jsonb),
        'payment_terms', COALESCE((
            SELECT jsonb_agg(jsonb_build_object(
                'id', term.id, 'weekly_payment', term.weekly_payment,
                'discount_amount', term.discount_amount, 'payment_day', term.payment_day,
                'effective_from', term.effective_from, 'effective_to', term.effective_to
            ) ORDER BY term.effective_from, term.id)
            FROM public.tenant_payment_terms AS term WHERE term.tenant_id = tenant.id
        ), '[]'::jsonb),
        'rental_events', COALESCE((
            SELECT jsonb_agg(jsonb_build_object(
                'id', event.id, 'event_type', event.event_type,
                'effective_date', event.effective_date, 'bike_id', event.bike_id,
                'bike_model', event.bike_model, 'bike_type', event.bike_type,
                'battery_config', event.battery_config, 'weekly_payment', event.weekly_payment,
                'discount_amount', event.discount_amount, 'amount', event.amount,
                'reason', event.reason, 'created_at', event.created_at
            ) ORDER BY event.effective_date, event.created_at, event.id)
            FROM public.tenant_rental_events AS event WHERE event.tenant_id = tenant.id
        ), '[]'::jsonb)
    )
    FROM public.tenants AS tenant
    LEFT JOIN public.bikes AS bike ON bike.id = tenant.bike_id
    WHERE tenant.slug = p_slug AND tenant.is_archived = FALSE
    LIMIT 1;
$$;

-- A payment request represents money received on an explicit business date.
-- Removing the legacy overload also prevents a cancelled client-side dialog
-- from silently recording a payment with CURRENT_DATE.
DROP FUNCTION IF EXISTS public.approve_payment_request(UUID, TEXT);

CREATE FUNCTION public.approve_payment_request(
    p_request_id UUID,
    p_payment_date DATE,
    p_admin_note TEXT DEFAULT NULL
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE request_row public.payment_requests%ROWTYPE;
BEGIN
    IF p_payment_date IS NULL OR p_payment_date > CURRENT_DATE THEN
        RAISE EXCEPTION 'Payment date must not be in the future';
    END IF;
    SELECT * INTO request_row FROM public.payment_requests WHERE id = p_request_id FOR UPDATE;
    IF NOT FOUND OR request_row.status <> 'pending' THEN RAISE EXCEPTION 'Pending payment request not found'; END IF;

    PERFORM public.record_tenant_payment(
        request_row.tenant_id,
        request_row.amount,
        p_payment_date,
        CASE WHEN request_row.payment_method = 'cash'
            THEN 'Наличные · заявка ' || request_row.id::TEXT
            ELSE 'Банковская оплата · заявка ' || request_row.id::TEXT END
    );
    UPDATE public.payment_requests
    SET status = 'approved', admin_note = COALESCE(NULLIF(BTRIM(p_admin_note), ''), admin_note),
        processed_at = NOW(), processed_by = auth.uid()
    WHERE id = p_request_id;
END;
$$;

REVOKE ALL ON FUNCTION public.approve_payment_request(UUID, DATE, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.approve_payment_request(UUID, DATE, TEXT) TO authenticated;

-- A completed rental releases equipment immediately, therefore it cannot be
-- dated in the future even when a caller bypasses the browser form.
CREATE OR REPLACE FUNCTION public.reject_future_rental_completion()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
    IF NEW.event_type = 'rental_ended' AND NEW.effective_date > CURRENT_DATE THEN
        RAISE EXCEPTION 'Rental completion date must not be in the future';
    END IF;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS tenant_rental_events_no_future_completion ON public.tenant_rental_events;
CREATE TRIGGER tenant_rental_events_no_future_completion
BEFORE INSERT OR UPDATE OF event_type, effective_date ON public.tenant_rental_events
FOR EACH ROW EXECUTE FUNCTION public.reject_future_rental_completion();

-- The UI now uses an append-only dated balance checkpoint. Keep the legacy
-- destructive reset unavailable to browser clients.
REVOKE EXECUTE ON FUNCTION public.reset_tenant_accounting(UUID, NUMERIC, DATE, DATE, NUMERIC, INTEGER) FROM authenticated;
