CREATE OR REPLACE FUNCTION public.get_dashboard_snapshot(
    p_reference_date DATE,
    p_show_archived BOOLEAN DEFAULT FALSE
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
    tenant_payload JSONB;
BEGIN
    SELECT COALESCE(jsonb_agg(
        (tenant - 'battery_config' - 'rental_events') || jsonb_build_object(
            'rental_events', COALESCE((
                SELECT jsonb_agg(event - ARRAY[
                    'bike_id', 'bike_model', 'bike_type', 'battery_config',
                    'weekly_payment', 'discount_amount', 'details'
                ]::TEXT[] ORDER BY event->>'effective_date', event->>'created_at')
                FROM jsonb_array_elements(tenant->'rental_events') AS event
            ), '[]'::jsonb)
        ) ORDER BY tenant->>'name'
    ), '[]'::jsonb)
    INTO tenant_payload
    FROM jsonb_array_elements(public.get_dashboard_tenants(p_reference_date, p_show_archived)) AS tenant;

    RETURN jsonb_build_object(
        'tenants', tenant_payload,
        'bikes', COALESCE((
            SELECT jsonb_agg(jsonb_build_object('id', b.id, 'status', b.status) ORDER BY b.id)
            FROM public.bikes b
        ), '[]'::jsonb)
    );
END;
$$;

REVOKE ALL ON FUNCTION public.get_dashboard_snapshot(DATE, BOOLEAN) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_dashboard_snapshot(DATE, BOOLEAN) TO authenticated;
