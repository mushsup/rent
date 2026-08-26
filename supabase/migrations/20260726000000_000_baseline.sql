CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

CREATE TABLE IF NOT EXISTS tenants (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
  name TEXT NOT NULL,
  slug TEXT NOT NULL UNIQUE,
  bike_name TEXT NOT NULL,
  weekly_price NUMERIC NOT NULL,
  start_date DATE NOT NULL,
  payment_day INTEGER CHECK (payment_day BETWEEN 1 AND 7) DEFAULT 1,
  admin_comment TEXT
);

CREATE TABLE IF NOT EXISTS payments (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  amount NUMERIC NOT NULL,
  payment_date DATE NOT NULL,
  period_start DATE,
  period_end DATE
);

ALTER TABLE tenants ENABLE ROW LEVEL SECURITY;
ALTER TABLE payments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public profiles are viewable by everyone."
  ON tenants FOR SELECT USING (TRUE);
CREATE POLICY "Users can insert their own profile."
  ON tenants FOR INSERT TO authenticated WITH CHECK (TRUE);
CREATE POLICY "Users can update own profile."
  ON tenants FOR UPDATE TO authenticated USING (TRUE) WITH CHECK (TRUE);
CREATE POLICY "Users can delete own profile."
  ON tenants FOR DELETE TO authenticated USING (TRUE);
CREATE POLICY "Payments are viewable by everyone."
  ON payments FOR SELECT USING (TRUE);
CREATE POLICY "Authenticated users can insert payments"
  ON payments FOR INSERT TO authenticated WITH CHECK (TRUE);
CREATE POLICY "Authenticated users can update payments"
  ON payments FOR UPDATE TO authenticated USING (TRUE) WITH CHECK (TRUE);
CREATE POLICY "Authenticated users can delete payments"
  ON payments FOR DELETE TO authenticated USING (TRUE);
