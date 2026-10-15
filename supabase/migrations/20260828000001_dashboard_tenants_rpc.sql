CREATE OR REPLACE FUNCTION public.get_dashboard_tenants(
    p_reference_date DATE,
    p_show_archived BOOLEAN DEFAULT FALSE
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
BEGIN
    IF p_reference_date IS NULL THEN
        RAISE EXCEPTION 'Reference date is required';
    END IF;

    PERFORM public.ensure_all_tenant_payment_charges(p_reference_date);

    RETURN COALESCE((
        SELECT jsonb_agg(tenant_row ORDER BY tenant_row->>'name')
        FROM (
            SELECT jsonb_build_object(
                'id', t.id,
                'name', t.name,
                'slug', t.slug,
                'bike_id', t.bike_id,
                'is_archived', t.is_archived,
                'battery_config', t.battery_config,
                'weekly_payment', t.weekly_payment,
                'discount_amount', t.discount_amount,
                'payment_day', t.payment_day,
                'next_payment_date', t.next_payment_date,
                'next_payment_amount', t.next_payment_amount,
                'accounting_start_date', t.accounting_start_date,
                'opening_balance', t.opening_balance,
                'payments', COALESCE((
                    SELECT jsonb_agg(jsonb_build_object(
                        'id', p.id,
                        'amount', p.amount,
                        'payment_date', p.payment_date,
                        'created_at', p.created_at
                    ) ORDER BY p.payment_date, p.created_at)
                    FROM public.payments p
                    WHERE p.tenant_id = t.id
                ), '[]'::jsonb),
                'payment_terms', COALESCE((
                    SELECT jsonb_agg(jsonb_build_object(
                        'id', pt.id,
                        'weekly_payment', pt.weekly_payment,
                        'discount_amount', pt.discount_amount,
                        'payment_day', pt.payment_day,
                        'effective_from', pt.effective_from,
                        'effective_to', pt.effective_to
                    ) ORDER BY pt.effective_from)
                    FROM public.tenant_payment_terms pt
                    WHERE pt.tenant_id = t.id
                ), '[]'::jsonb),
                'payment_charges', COALESCE((
                    SELECT jsonb_agg(jsonb_build_object(
                        'id', c.id,
                        'due_date', c.due_date,
                        'period_start', c.period_start,
                        'period_end', c.period_end,
                        'amount', c.amount,
                        'status', c.status,
                        'is_automatic', c.is_automatic,
                        'approved_at', c.approved_at,
                        'created_at', c.created_at
                    ) ORDER BY c.due_date, c.created_at)
                    FROM public.tenant_payment_charges c
                    WHERE c.tenant_id = t.id
                ), '[]'::jsonb),
                'payment_adjustments', COALESCE((
                    SELECT jsonb_agg(jsonb_build_object(
                        'id', a.id,
                        'direction', a.direction,
                        'amount', a.amount,
                        'adjustment_date', a.adjustment_date,
                        'created_at', a.created_at
                    ) ORDER BY a.adjustment_date, a.created_at)
                    FROM public.tenant_payment_adjustments a
                    WHERE a.tenant_id = t.id
                ), '[]'::jsonb),
                'rental_events', COALESCE((
                    SELECT jsonb_agg(jsonb_build_object(
                        'id', re.id,
                        'event_type', re.event_type,
                        'effective_date', re.effective_date,
                        'weekly_payment', re.weekly_payment,
                        'discount_amount', re.discount_amount,
                        'amount', re.amount,
                        'reason', re.reason,
                        'created_at', re.created_at
                    ) ORDER BY re.effective_date, re.created_at)
                    FROM public.tenant_rental_events re
                    WHERE re.tenant_id = t.id
                ), '[]'::jsonb),
                'bikes', (
                    SELECT jsonb_build_object(
                        'id', b.id,
                        'model', b.model
                    )
                    FROM public.bikes b
                    WHERE b.id = t.bike_id
                )
            ) AS tenant_row
            FROM public.tenants t
            WHERE t.is_archived = p_show_archived
        ) rows
    ), '[]'::jsonb);
END;
$$;

REVOKE ALL ON FUNCTION public.get_dashboard_tenants(DATE, BOOLEAN) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_dashboard_tenants(DATE, BOOLEAN) TO authenticated;
