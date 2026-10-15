-- A completed rental has no active bike, so it cannot be corrected through
-- finish_tenant_rental again. Keep this correction scoped to its ledger event
-- and its final manual charge; it never reassigns a bike or restarts a rental.
CREATE OR REPLACE FUNCTION public.update_finished_tenant_rental(
    p_event_id UUID,
    p_end_date DATE,
    p_final_amount NUMERIC,
    p_reason TEXT
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
    event_row public.tenant_rental_events%ROWTYPE;
    charge_row public.tenant_payment_charges%ROWTYPE;
    calculation JSONB;
    later_rental_date DATE;
BEGIN
    IF p_end_date IS NULL THEN RAISE EXCEPTION 'Rental end date is required'; END IF;
    IF p_final_amount IS NULL OR p_final_amount < 0 THEN RAISE EXCEPTION 'Final amount must not be negative'; END IF;
    IF NULLIF(BTRIM(p_reason), '') IS NULL THEN RAISE EXCEPTION 'Rental end reason is required'; END IF;

    SELECT * INTO event_row
    FROM public.tenant_rental_events
    WHERE id = p_event_id
    FOR UPDATE;
    IF NOT FOUND OR event_row.event_type <> 'rental_ended' THEN
        RAISE EXCEPTION 'Completed rental event not found';
    END IF;

    -- Do not let a correction cross into a later rental period for this tenant.
    SELECT MIN(effective_date) INTO later_rental_date
    FROM public.tenant_rental_events
    WHERE tenant_id = event_row.tenant_id
      AND id <> event_row.id
      AND event_type <> 'rental_ended'
      AND effective_date > event_row.effective_date;
    IF later_rental_date IS NOT NULL AND p_end_date >= later_rental_date THEN
        RAISE EXCEPTION 'End date must be before the next rental event';
    END IF;
    IF EXISTS (
        SELECT 1 FROM public.tenant_rental_events
        WHERE tenant_id = event_row.tenant_id
          AND event_type = 'rental_ended'
          AND effective_date = p_end_date
          AND id <> event_row.id
    ) THEN
        RAISE EXCEPTION 'A rental completion already exists for this date';
    END IF;

    -- Final charges created before this migration have no event id. The exact
    -- comment/date combination makes the fallback deterministic; otherwise we
    -- fail rather than silently changing the wrong financial record.
    SELECT * INTO charge_row
    FROM public.tenant_payment_charges
    WHERE tenant_id = event_row.tenant_id
      AND is_automatic = FALSE
      AND comment LIKE 'Завершение аренды:%'
      AND (period_end = event_row.effective_date OR due_date = event_row.effective_date)
    ORDER BY created_at DESC, id DESC
    LIMIT 1
    FOR UPDATE;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Final rental charge not found; create a financial correction instead';
    END IF;

    calculation := public.calculate_tenant_rental_period(
        event_row.tenant_id,
        charge_row.period_start,
        p_end_date
    );

    UPDATE public.tenant_payment_charges
    SET due_date = CASE
            WHEN EXISTS (
                SELECT 1 FROM public.tenant_payment_charges AS other_charge
                WHERE other_charge.tenant_id = event_row.tenant_id
                  AND other_charge.due_date = p_end_date
                  AND other_charge.id <> charge_row.id
            ) THEN charge_row.due_date
            ELSE p_end_date
        END,
        period_end = p_end_date,
        amount = p_final_amount,
        breakdown = COALESCE(calculation->'segments', '[]'::JSONB),
        status = CASE WHEN p_final_amount = 0 THEN 'waived' ELSE 'open' END,
        comment = 'Завершение аренды: ' || BTRIM(p_reason)
    WHERE id = charge_row.id;

    UPDATE public.tenant_rental_events
    SET effective_date = p_end_date,
        amount = p_final_amount,
        reason = BTRIM(p_reason),
        details = COALESCE(details, '{}'::JSONB) || jsonb_build_object(
            'final_amount', p_final_amount,
            'corrected_at', NOW()
        )
    WHERE id = event_row.id;
END;
$$;

REVOKE ALL ON FUNCTION public.update_finished_tenant_rental(UUID, DATE, NUMERIC, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.update_finished_tenant_rental(UUID, DATE, NUMERIC, TEXT) TO authenticated;
