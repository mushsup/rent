-- Rental terms belong to the tenant, not to inventory.
ALTER TABLE tenants
ADD COLUMN IF NOT EXISTS weekly_payment NUMERIC(10,2);

ALTER TABLE tenants
ADD COLUMN IF NOT EXISTS payment_day INTEGER;

UPDATE tenants AS tenant
SET weekly_payment = COALESCE(
    NULLIF(tenant.weekly_payment, 0),
    NULLIF(tenant.next_payment_amount, 0),
    bike.price,
    0
)
FROM bikes AS bike
WHERE bike.id = tenant.bike_id;

UPDATE tenants
SET weekly_payment = COALESCE(weekly_payment, 0),
    payment_day = COALESCE(
        payment_day,
        CASE
            WHEN next_payment_date IS NULL THEN 1
            ELSE EXTRACT(ISODOW FROM next_payment_date)::INTEGER
        END
    );

ALTER TABLE tenants
ALTER COLUMN weekly_payment SET DEFAULT 0,
ALTER COLUMN weekly_payment SET NOT NULL,
ALTER COLUMN payment_day SET DEFAULT 1,
ALTER COLUMN payment_day SET NOT NULL;

ALTER TABLE tenants
ADD CONSTRAINT tenants_payment_day_check CHECK (payment_day BETWEEN 1 AND 7);

ALTER TABLE bikes
DROP COLUMN IF EXISTS price;
