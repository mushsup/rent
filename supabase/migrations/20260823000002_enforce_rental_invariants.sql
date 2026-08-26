-- Keep the relational invariant explicit: one bike can belong to at most one
-- tenant, and an assigned bike must remain in the rent state.
DO $$
BEGIN
    IF EXISTS (
        SELECT 1
        FROM tenants
        WHERE bike_id IS NOT NULL
        GROUP BY bike_id
        HAVING COUNT(*) > 1
    ) THEN
        RAISE EXCEPTION 'Cannot add tenant bike uniqueness: duplicate assignments exist';
    END IF;

    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conname = 'bikes_status_valid'
    ) THEN
        ALTER TABLE bikes
            ADD CONSTRAINT bikes_status_valid
            CHECK (status IN ('available', 'in_rent', 'maintenance'));
    END IF;
END;
$$;

CREATE UNIQUE INDEX IF NOT EXISTS tenants_one_active_bike_idx
    ON tenants (bike_id)
    WHERE bike_id IS NOT NULL;

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

    IF assigned_tenant_id IS NOT NULL AND p_status <> 'in_rent' THEN
        RAISE EXCEPTION 'Finish or reassign the rental before changing this bike status';
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

-- The current API uses the extended signatures. Remove superseded overloads so
-- named-argument RPC calls cannot resolve against two historical contracts.
DROP FUNCTION IF EXISTS update_tenant_profile(UUID, TEXT, TEXT, UUID, NUMERIC, INTEGER, DATE, NUMERIC, TEXT);
DROP FUNCTION IF EXISTS create_tenant_with_rental(TEXT, TEXT, UUID, NUMERIC, INTEGER, DATE, NUMERIC, TEXT, TEXT);
