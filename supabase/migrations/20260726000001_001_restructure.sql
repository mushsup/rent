-- 1. Create bikes table
CREATE TABLE bikes (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    type TEXT NOT NULL,
    model TEXT NOT NULL,
    price INTEGER NOT NULL,
    status TEXT NOT NULL DEFAULT 'available', -- 'available', 'in_rent', 'maintenance'
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 2. Modify tenants table
-- Since there are currently columns that we need to drop, we'll alter the table
ALTER TABLE tenants 
-- We can't immediately drop name/slug etc, we just need to add bike_id
ADD COLUMN bike_id UUID REFERENCES bikes(id);

-- Drop old columns on tenants
ALTER TABLE tenants
DROP COLUMN IF EXISTS start_date,
DROP COLUMN IF EXISTS free_days,
DROP COLUMN IF EXISTS weekly_price,
DROP COLUMN IF EXISTS bike_name,
DROP COLUMN IF EXISTS created_at;

-- 3. Modify payments table
-- Drop period_start and period_end if they exist
ALTER TABLE payments
DROP COLUMN IF EXISTS period_start,
DROP COLUMN IF EXISTS period_end;
