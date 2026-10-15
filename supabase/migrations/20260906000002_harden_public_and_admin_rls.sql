-- All operational data is admin-only. Public tenant history is exposed solely
-- by the intentionally limited SECURITY DEFINER function below.
DO $$
DECLARE
    table_name TEXT;
    policy RECORD;
BEGIN
    FOREACH table_name IN ARRAY ARRAY[
        'batteries',
        'bike_tasks',
        'bikes',
        'credit_transactions',
        'credits',
        'payment_requests',
        'payments',
        'tenant_payment_adjustments',
        'tenant_payment_charges',
        'tenant_payment_terms',
        'tenant_rental_events',
        'tenants'
    ]
    LOOP
        EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', table_name);

        FOR policy IN
            SELECT policyname
            FROM pg_policies
            WHERE schemaname = 'public' AND tablename = table_name
        LOOP
            EXECUTE format('DROP POLICY %I ON public.%I', policy.policyname, table_name);
        END LOOP;

        EXECUTE format(
            'CREATE POLICY %I ON public.%I FOR ALL TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin())',
            'Administrators can manage ' || table_name,
            table_name
        );
        EXECUTE format('REVOKE ALL ON TABLE public.%I FROM anon', table_name);
        EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.%I TO authenticated', table_name);
    END LOOP;
END;
$$;

-- This is the complete projection used by PaymentHistory in public mode. It
-- intentionally excludes contacts, deposits and private administrator notes.
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
            FROM public.payments AS payment
            WHERE payment.tenant_id = tenant.id
        ), '[]'::jsonb),
        'payment_charges', COALESCE((
            SELECT jsonb_agg(jsonb_build_object(
                'id', charge.id, 'due_date', charge.due_date,
                'period_start', charge.period_start, 'period_end', charge.period_end,
                'amount', charge.amount, 'breakdown', charge.breakdown,
                'status', charge.status, 'is_automatic', charge.is_automatic,
                'created_at', charge.created_at
            ) ORDER BY charge.due_date, charge.id)
            FROM public.tenant_payment_charges AS charge
            WHERE charge.tenant_id = tenant.id
        ), '[]'::jsonb),
        'payment_adjustments', COALESCE((
            SELECT jsonb_agg(jsonb_build_object(
                'id', adjustment.id, 'direction', adjustment.direction,
                'amount', adjustment.amount, 'adjustment_date', adjustment.adjustment_date,
                'comment', adjustment.comment, 'source_event_id', adjustment.source_event_id,
                'created_at', adjustment.created_at
            ) ORDER BY adjustment.adjustment_date, adjustment.id)
            FROM public.tenant_payment_adjustments AS adjustment
            WHERE adjustment.tenant_id = tenant.id
        ), '[]'::jsonb),
        'payment_terms', COALESCE((
            SELECT jsonb_agg(jsonb_build_object(
                'id', term.id, 'weekly_payment', term.weekly_payment,
                'discount_amount', term.discount_amount, 'payment_day', term.payment_day,
                'effective_from', term.effective_from, 'effective_to', term.effective_to
            ) ORDER BY term.effective_from, term.id)
            FROM public.tenant_payment_terms AS term
            WHERE term.tenant_id = tenant.id
        ), '[]'::jsonb),
        'rental_events', COALESCE((
            SELECT jsonb_agg(jsonb_build_object(
                'id', event.id, 'event_type', event.event_type,
                'effective_date', event.effective_date, 'bike_id', event.bike_id,
                'bike_model', event.bike_model, 'bike_type', event.bike_type,
                'battery_config', event.battery_config, 'weekly_payment', event.weekly_payment,
                'discount_amount', event.discount_amount, 'amount', event.amount,
                'reason', event.reason, 'details', event.details, 'created_at', event.created_at
            ) ORDER BY event.effective_date, event.created_at, event.id)
            FROM public.tenant_rental_events AS event
            WHERE event.tenant_id = tenant.id
        ), '[]'::jsonb)
    )
    FROM public.tenants AS tenant
    LEFT JOIN public.bikes AS bike ON bike.id = tenant.bike_id
    WHERE tenant.slug = p_slug AND tenant.is_archived = FALSE
    LIMIT 1;
$$;

REVOKE ALL ON FUNCTION public.get_public_tenant_profile(TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_public_tenant_profile(TEXT) TO anon, authenticated;
