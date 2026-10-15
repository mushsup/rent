-- Relax the bike-status invariant for assigned bikes.
--
-- Previously `update_bike_inventory` rejected ANY update that passed
-- p_status <> 'in_rent' while the bike was assigned, which also blocked
-- harmless model/type edits that simply re-sent the stored status value.
--
-- New behavior:
-- * model/type-only updates (p_status equals the stored status) are allowed;
-- * an inconsistent stored status (assigned but not in_rent) is auto-corrected;
-- * an explicit status change away from in_rent still raises, so a rental
--   must be finished or reassigned first.
CREATE OR REPLACE FUNCTION update_bike_inventory(
    p_bike_id UUID,
    p_model TEXT,
    p_type TEXT,
    p_status TEXT
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
    assigned_tenant_id UUID;
    current_status TEXT;
BEGIN
    IF NULLIF(BTRIM(p_model), '') IS NULL THEN
        RAISE EXCEPTION 'Bike model is required';
    END IF;
    IF p_status NOT IN ('available', 'in_rent', 'maintenance') THEN
        RAISE EXCEPTION 'Invalid bike status';
    END IF;

    PERFORM 1 FROM bikes WHERE id = p_bike_id FOR UPDATE;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Bike not found';
    END IF;

    SELECT id INTO assigned_tenant_id
    FROM tenants
    WHERE bike_id = p_bike_id
    FOR UPDATE;

    -- If bike is assigned to a tenant, it must be in_rent status.
    -- Read the stored status first so model/type-only updates pass through.
    IF assigned_tenant_id IS NOT NULL AND p_status <> 'in_rent' THEN
        SELECT status INTO current_status FROM bikes WHERE id = p_bike_id FOR UPDATE;

        IF current_status = 'in_rent' AND p_status = current_status THEN
            -- Model/type change that keeps the stored status: allow it.
            NULL;
        ELSIF current_status != 'in_rent' THEN
            -- Data inconsistency: bike is assigned but status is not in_rent.
            -- Auto-correct to in_rent.
            p_status := 'in_rent';
        ELSE
            -- Explicit status change away from in_rent while assigned.
            RAISE EXCEPTION 'Finish or reassign the rental before changing this bike status';
        END IF;
    END IF;

    UPDATE bikes
    SET model = BTRIM(p_model),
        type = BTRIM(p_type),
        status = p_status
    WHERE id = p_bike_id;
END;
$$;

REVOKE ALL ON FUNCTION update_bike_inventory(UUID, TEXT, TEXT, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION update_bike_inventory(UUID, TEXT, TEXT, TEXT) TO authenticated;
