ALTER TABLE public.tenant_payment_charges
    ADD COLUMN IF NOT EXISTS approved_at TIMESTAMP WITH TIME ZONE;

-- Existing historical charges are already part of the ledger. New/current
-- automatic charges remain pending until an operator explicitly approves them.
UPDATE public.tenant_payment_charges
SET approved_at = created_at
WHERE approved_at IS NULL
  AND due_date < CURRENT_DATE;

CREATE OR REPLACE FUNCTION public.approve_tenant_payment_charge(p_charge_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
BEGIN
    IF NOT is_admin() THEN
        RAISE EXCEPTION 'Only admins can approve payment charges';
    END IF;

    UPDATE tenant_payment_charges
    SET approved_at = COALESCE(approved_at, NOW())
    WHERE id = p_charge_id
      AND status = 'open';

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Open payment charge not found';
    END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.approve_tenant_payment_charge(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.approve_tenant_payment_charge(UUID) TO authenticated;
