DO $$
DECLARE
    demo_tenant_id UUID;
    charge_id UUID;
BEGIN
    SELECT id INTO demo_tenant_id FROM public.tenants WHERE slug = 'demo-payments';

    IF demo_tenant_id IS NULL THEN
        INSERT INTO public.tenants (
            name, slug, payment_day, weekly_payment, next_payment_date, next_payment_amount,
            accounting_start_date, opening_balance, is_archived, admin_comment
        ) VALUES (
            'DEMO · Платежи', 'demo-payments', 1, 300, DATE '2026-08-31', 300,
            DATE '2026-08-03', 0, FALSE,
            'Тестовый клиент: вовремя, просрочка и ожидаемый платёж.'
        ) RETURNING id INTO demo_tenant_id;
    ELSE
        DELETE FROM public.payments WHERE tenant_id = demo_tenant_id;
        DELETE FROM public.tenant_payment_charges WHERE tenant_id = demo_tenant_id;
        UPDATE public.tenants
        SET name = 'DEMO · Платежи', weekly_payment = 300, next_payment_date = DATE '2026-08-31',
            next_payment_amount = 300, accounting_start_date = DATE '2026-08-03',
            opening_balance = 0, is_archived = FALSE,
            admin_comment = 'Тестовый клиент: вовремя, просрочка и ожидаемый платёж.'
        WHERE id = demo_tenant_id;
    END IF;

    INSERT INTO public.tenant_payment_charges (tenant_id, due_date, period_start, period_end, amount, comment, status, is_automatic, approved_at)
    VALUES
        (demo_tenant_id, DATE '2026-08-03', DATE '2026-07-28', DATE '2026-08-03', 300, 'Демо · оплачено вовремя', 'open', FALSE, NOW()),
        (demo_tenant_id, DATE '2026-08-10', DATE '2026-08-04', DATE '2026-08-10', 300, 'Демо · оплачено вовремя', 'open', FALSE, NOW()),
        (demo_tenant_id, DATE '2026-08-17', DATE '2026-08-11', DATE '2026-08-17', 300, 'Демо · оплачено вовремя', 'open', FALSE, NOW()),
        (demo_tenant_id, DATE '2026-08-24', DATE '2026-08-18', DATE '2026-08-24', 300, 'Демо · просрочка', 'open', FALSE, NOW()),
        (demo_tenant_id, DATE '2026-08-31', DATE '2026-08-25', DATE '2026-08-31', 300, 'Демо · ожидаемый платёж', 'open', FALSE, NULL);

    INSERT INTO public.payments (tenant_id, amount, payment_date, comment)
    VALUES
        (demo_tenant_id, 300, DATE '2026-08-03', 'Демо · оплата вовремя 1'),
        (demo_tenant_id, 300, DATE '2026-08-10', 'Демо · оплата вовремя 2'),
        (demo_tenant_id, 300, DATE '2026-08-17', 'Демо · оплата вовремя 3');
END $$;
