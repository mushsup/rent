UPDATE public.tenant_payment_charges
SET is_automatic = TRUE
WHERE tenant_id = (SELECT id FROM public.tenants WHERE slug = 'demo-payments');
