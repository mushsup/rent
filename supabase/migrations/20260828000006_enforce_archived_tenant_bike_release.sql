-- An archived tenant cannot keep an active rental assignment.
-- This also protects the invariant when a tenant row is changed outside the
-- admin RPCs (for example by a data repair or an older client).

CREATE OR REPLACE FUNCTION public.clear_archived_tenant_bike()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    IF NEW.is_archived AND NEW.bike_id IS NOT NULL THEN
        NEW.bike_id := NULL;
    END IF;

    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS tenants_clear_archived_bike ON public.tenants;
CREATE TRIGGER tenants_clear_archived_bike
BEFORE INSERT OR UPDATE OF is_archived, bike_id ON public.tenants
FOR EACH ROW
EXECUTE FUNCTION public.clear_archived_tenant_bike();

-- Include archive-only updates as well. The BEFORE trigger above may clear
-- bike_id even when the original statement changed only is_archived.
DROP TRIGGER IF EXISTS tenants_sync_bike_status ON public.tenants;
CREATE TRIGGER tenants_sync_bike_status
AFTER INSERT OR UPDATE OF bike_id, is_archived OR DELETE ON public.tenants
FOR EACH ROW
EXECUTE FUNCTION public.sync_bike_status_from_tenant();

-- Existing rows are repaired through the same trigger, so the bike-status
-- synchronization trigger releases their bikes as well.
UPDATE public.tenants
SET bike_id = NULL
WHERE is_archived = TRUE
  AND bike_id IS NOT NULL;

-- No bike may remain in rent without an active, non-archived tenant.
UPDATE public.bikes AS bike
SET status = 'available'
WHERE bike.status = 'in_rent'
  AND NOT EXISTS (
      SELECT 1
      FROM public.tenants AS tenant
      WHERE tenant.bike_id = bike.id
        AND tenant.is_archived = FALSE
  );
