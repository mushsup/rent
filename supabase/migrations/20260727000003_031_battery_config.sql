ALTER TABLE tenants
    ADD COLUMN IF NOT EXISTS battery_config TEXT;

CREATE INDEX IF NOT EXISTS tenants_battery_config_idx ON tenants (battery_config);

CREATE OR REPLACE FUNCTION get_public_tenant_profile(p_slug TEXT)
RETURNS JSONB
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT jsonb_build_object(
        'id', tenant.id, 'name', tenant.name, 'slug', tenant.slug,
        'weekly_payment', tenant.weekly_payment, 'payment_day', tenant.payment_day,
        'next_payment_date', tenant.next_payment_date, 'next_payment_amount', tenant.next_payment_amount,
        'accounting_start_date', tenant.accounting_start_date, 'opening_balance', tenant.opening_balance,
        'battery_config', tenant.battery_config, 'admin_comment', tenant.admin_comment,
        'bikes', CASE WHEN bike.id IS NULL THEN NULL ELSE jsonb_build_object('id', bike.id, 'model', bike.model, 'type', bike.type) END,
        'payments', COALESCE((SELECT jsonb_agg(jsonb_build_object('id', payment.id, 'amount', payment.amount, 'payment_date', payment.payment_date, 'created_at', payment.created_at) ORDER BY payment.payment_date, payment.id) FROM payments AS payment WHERE payment.tenant_id = tenant.id), '[]'::jsonb),
        'payment_charges', COALESCE((SELECT jsonb_agg(jsonb_build_object('id', charge.id, 'due_date', charge.due_date, 'amount', charge.amount, 'status', charge.status, 'is_automatic', charge.is_automatic, 'created_at', charge.created_at) ORDER BY charge.due_date, charge.id) FROM tenant_payment_charges AS charge WHERE charge.tenant_id = tenant.id), '[]'::jsonb),
        'payment_adjustments', COALESCE((SELECT jsonb_agg(jsonb_build_object('id', adjustment.id, 'direction', adjustment.direction, 'amount', adjustment.amount, 'adjustment_date', adjustment.adjustment_date, 'created_at', adjustment.created_at) ORDER BY adjustment.adjustment_date, adjustment.id) FROM tenant_payment_adjustments AS adjustment WHERE adjustment.tenant_id = tenant.id), '[]'::jsonb),
        'payment_terms', COALESCE((SELECT jsonb_agg(jsonb_build_object('id', term.id, 'weekly_payment', term.weekly_payment, 'payment_day', term.payment_day, 'effective_from', term.effective_from, 'effective_to', term.effective_to) ORDER BY term.effective_from, term.id) FROM tenant_payment_terms AS term WHERE term.tenant_id = tenant.id), '[]'::jsonb)
    )
    FROM tenants AS tenant LEFT JOIN bikes AS bike ON bike.id = tenant.bike_id
    WHERE tenant.slug = p_slug AND tenant.is_archived = FALSE LIMIT 1;
$$;

REVOKE ALL ON FUNCTION get_public_tenant_profile(TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION get_public_tenant_profile(TEXT) TO anon, authenticated;
