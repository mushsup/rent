-- SQL Editor Script for Supabase (E-bike Rental Management)

-- 1. Create table for Tenants (Арендаторы)
CREATE TABLE tenants (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  created_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL,
  name text NOT NULL,
  slug text NOT NULL UNIQUE,
  bike_name text NOT NULL,
  weekly_price numeric NOT NULL,
  start_date date NOT NULL,
  payment_day int CHECK (payment_day BETWEEN 1 AND 7) DEFAULT 1,
  admin_comment text
);

-- 2. Create table for Payments (Платежи)
CREATE TABLE payments (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  created_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL,
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  amount numeric NOT NULL,
  payment_date date NOT NULL,
  period_start date,
  period_end date
);

-- 3. Enable Row Level Security (RLS)
ALTER TABLE tenants ENABLE ROW LEVEL SECURITY;
ALTER TABLE payments ENABLE ROW LEVEL SECURITY;

-- 4. Policies for Tenants
-- Anyone can view tenants (needed for public link)
CREATE POLICY "Public profiles are viewable by everyone."
  ON tenants FOR SELECT
  USING ( true );

-- Only authenticated admins can insert/update/delete
CREATE POLICY "Users can insert their own profile."
  ON tenants FOR INSERT
  WITH CHECK ( auth.role() = 'authenticated' );

CREATE POLICY "Users can update own profile."
  ON tenants FOR UPDATE
  USING ( auth.role() = 'authenticated' );

CREATE POLICY "Users can delete own profile."
  ON tenants FOR DELETE
  USING ( auth.role() = 'authenticated' );

-- 5. Policies for Payments
-- Anyone can view payments (to calculate debt on public page)
CREATE POLICY "Payments are viewable by everyone."
  ON payments FOR SELECT
  USING ( true );

-- Only authenticated admins can manage payments
CREATE POLICY "Authenticated users can insert payments"
  ON payments FOR INSERT
  WITH CHECK ( auth.role() = 'authenticated' );

CREATE POLICY "Authenticated users can update payments"
  ON payments FOR UPDATE
  USING ( auth.role() = 'authenticated' );

CREATE POLICY "Authenticated users can delete payments"
  ON payments FOR DELETE
  USING ( auth.role() = 'authenticated' );
