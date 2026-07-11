-- Repair tenants whose recurring payment was left at zero during the price migration.
-- This is safe to run after 004; it does not overwrite non-zero weekly payments.
UPDATE tenants AS tenant
SET weekly_payment = COALESCE(
    NULLIF(tenant.next_payment_amount, 0),
    (
        SELECT payment.amount
        FROM payments AS payment
        WHERE payment.tenant_id = tenant.id
        ORDER BY payment.payment_date DESC, payment.id DESC
        LIMIT 1
    ),
    0
)
WHERE COALESCE(tenant.weekly_payment, 0) = 0;
