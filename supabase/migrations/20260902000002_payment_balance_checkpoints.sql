ALTER TABLE public.tenant_payment_adjustments
ADD COLUMN IF NOT EXISTS balance_override NUMERIC(10,2);

ALTER TABLE public.tenant_payment_adjustments
DROP CONSTRAINT IF EXISTS tenant_payment_adjustments_amount_check;

ALTER TABLE public.tenant_payment_adjustments
ADD CONSTRAINT tenant_payment_adjustments_amount_check CHECK (amount >= 0);

COMMENT ON COLUMN public.tenant_payment_adjustments.balance_override IS
    'When set, replaces the running tenant balance on adjustment_date; later ledger events continue from this value.';
