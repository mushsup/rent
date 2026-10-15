DO $$
DECLARE
    demo_tenant_id UUID;
    demo_bike_id UUID;
BEGIN
    SELECT id INTO demo_tenant_id FROM public.tenants WHERE slug = 'demo-payments';
    IF demo_tenant_id IS NULL THEN RETURN; END IF;

    SELECT id INTO demo_bike_id FROM public.bikes WHERE model = 'DEMO · Велосипед';
    IF demo_bike_id IS NULL THEN
        INSERT INTO public.bikes (type, model, status, voice_code)
        VALUES ('demo', 'DEMO · Велосипед', 'available', '000')
        RETURNING id INTO demo_bike_id;
    END IF;

    UPDATE public.tenants
    SET bike_id = demo_bike_id, next_payment_date = DATE '2026-08-31', next_payment_amount = 300,
        weekly_payment = 300, is_archived = FALSE
    WHERE id = demo_tenant_id;
    UPDATE public.bikes SET status = 'in_rent' WHERE id = demo_bike_id;

    INSERT INTO public.tenant_payment_charges (tenant_id, due_date, period_start, period_end, amount, comment, status, is_automatic, approved_at)
    VALUES
        (demo_tenant_id, DATE '2026-08-24', DATE '2026-08-18', DATE '2026-08-24', 300, 'Демо · не оплачено', 'open', TRUE, NOW()),
        (demo_tenant_id, DATE '2026-08-31', DATE '2026-08-25', DATE '2026-08-31', 300, 'Демо · ожидаемый платёж', 'open', TRUE, NULL)
    ON CONFLICT (tenant_id, due_date) DO UPDATE SET is_automatic = TRUE, amount = EXCLUDED.amount, comment = EXCLUDED.comment;
END $$;
