-- Repair active rentals that predate the rental-event ledger. This is safe to
-- rerun: it only creates an initial snapshot when a tenant has no events yet.
INSERT INTO public.tenant_rental_events (
    tenant_id,
    event_type,
    effective_date,
    bike_id,
    bike_model,
    bike_type,
    battery_config,
    weekly_payment,
    discount_amount,
    reason
)
SELECT
    tenant.id,
    'rental_started',
    COALESCE(tenant.accounting_start_date, tenant.next_payment_date, CURRENT_DATE),
    tenant.bike_id,
    bike.model,
    bike.type,
    tenant.battery_config,
    tenant.weekly_payment,
    tenant.discount_amount,
    'Восстановленное начальное состояние аренды'
FROM public.tenants AS tenant
JOIN public.bikes AS bike ON bike.id = tenant.bike_id
WHERE tenant.bike_id IS NOT NULL
  AND NOT EXISTS (
      SELECT 1
      FROM public.tenant_rental_events AS event
      WHERE event.tenant_id = tenant.id
  );
