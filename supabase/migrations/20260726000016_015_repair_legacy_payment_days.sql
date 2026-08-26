-- Legacy tenants did not store payment_day. Infer it from their current
-- payment pointer without overwriting tenants that already have term history.
UPDATE tenants AS tenant
SET payment_day = EXTRACT(ISODOW FROM tenant.next_payment_date)::INTEGER
WHERE tenant.next_payment_date IS NOT NULL
  AND NOT EXISTS (
      SELECT 1
      FROM tenant_payment_terms AS term
      WHERE term.tenant_id = tenant.id
  );
