UPDATE tenants
SET weekly_payment = GREATEST(COALESCE(weekly_payment, 0), 0),
    next_payment_amount = CASE
        WHEN next_payment_amount IS NULL THEN NULL
        ELSE GREATEST(next_payment_amount, 0)
    END,
    deposit = GREATEST(COALESCE(deposit, 0), 0)
WHERE weekly_payment < 0
   OR COALESCE(next_payment_amount, 0) < 0
   OR COALESCE(deposit, 0) < 0;

DELETE FROM payments WHERE amount <= 0;

DELETE FROM tenant_payment_charges AS charge
USING tenants AS tenant
WHERE charge.tenant_id = tenant.id
  AND charge.is_automatic = TRUE
  AND tenant.weekly_payment <= 0;

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'payments_amount_positive') THEN
        ALTER TABLE payments
            ADD CONSTRAINT payments_amount_positive CHECK (amount > 0);
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'tenants_weekly_payment_nonnegative') THEN
        ALTER TABLE tenants
            ADD CONSTRAINT tenants_weekly_payment_nonnegative CHECK (weekly_payment >= 0);
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'tenants_next_payment_amount_nonnegative') THEN
        ALTER TABLE tenants
            ADD CONSTRAINT tenants_next_payment_amount_nonnegative
            CHECK (next_payment_amount IS NULL OR next_payment_amount >= 0);
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'tenants_deposit_nonnegative') THEN
        ALTER TABLE tenants
            ADD CONSTRAINT tenants_deposit_nonnegative CHECK (deposit >= 0);
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'credit_transactions_amount_positive') THEN
        ALTER TABLE credit_transactions
            ADD CONSTRAINT credit_transactions_amount_positive CHECK (amount > 0);
    END IF;
END;
$$;
