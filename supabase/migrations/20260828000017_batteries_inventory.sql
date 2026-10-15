CREATE TABLE IF NOT EXISTS public.batteries (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    code TEXT NOT NULL UNIQUE CHECK (code ~ '^[0-9]{3}$'),
    status TEXT NOT NULL DEFAULT 'available' CHECK (status IN ('available', 'in_rent', 'maintenance')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.batteries ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Administrators can manage batteries" ON public.batteries
    FOR ALL TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());
REVOKE ALL ON public.batteries FROM anon;
GRANT SELECT, INSERT, UPDATE ON public.batteries TO authenticated;
