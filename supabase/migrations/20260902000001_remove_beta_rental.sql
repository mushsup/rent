-- Remove the abandoned parallel rental beta without touching the legacy
-- tenant, bike, payment, battery or payment-request data.

CREATE OR REPLACE FUNCTION public.touch_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
    NEW.updated_at := NOW();
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS payment_requests_touch_updated_at ON public.payment_requests;
CREATE TRIGGER payment_requests_touch_updated_at
BEFORE UPDATE ON public.payment_requests
FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

DROP FUNCTION IF EXISTS public.beta_create_booking(UUID, UUID, TIMESTAMPTZ, TIMESTAMPTZ, NUMERIC, INTEGER, NUMERIC, TEXT, INTEGER, TEXT);
DROP FUNCTION IF EXISTS public.beta_activate_reservation(UUID);
DROP FUNCTION IF EXISTS public.beta_cancel_reservation(UUID, TEXT, BOOLEAN);
DROP FUNCTION IF EXISTS public.beta_finish_rental(UUID, NUMERIC, TEXT);
DROP FUNCTION IF EXISTS public.beta_pause_rental(UUID, TEXT, NUMERIC, TEXT);
DROP FUNCTION IF EXISTS public.beta_resume_rental(UUID, UUID);
DROP FUNCTION IF EXISTS public.beta_swap_bike(UUID, UUID, TEXT);

DROP TABLE IF EXISTS public.rental_audit_events;
DROP TABLE IF EXISTS public.rental_pauses;
DROP TABLE IF EXISTS public.rental_allocations;
DROP TABLE IF EXISTS public.bike_availability_blocks;
DROP TABLE IF EXISTS public.rental_contracts;

DROP FUNCTION IF EXISTS public.touch_beta_rental_updated_at();
