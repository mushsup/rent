CREATE OR REPLACE FUNCTION public.get_dashboard_snapshot(
    p_reference_date DATE,
    p_show_archived BOOLEAN DEFAULT FALSE
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
BEGIN
    RETURN jsonb_build_object(
        'tenants', public.get_dashboard_tenants(p_reference_date, p_show_archived),
        'bikes', COALESCE((
            SELECT jsonb_agg(jsonb_build_object('id', b.id, 'status', b.status) ORDER BY b.id)
            FROM public.bikes b
        ), '[]'::jsonb)
    );
END;
$$;

REVOKE ALL ON FUNCTION public.get_dashboard_snapshot(DATE, BOOLEAN) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_dashboard_snapshot(DATE, BOOLEAN) TO authenticated;
