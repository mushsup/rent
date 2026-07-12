# Architecture

## Runtime

The project is a React/Vite single-page application deployed as static assets. `HashRouter` keeps the current `/rent/` deployment compatible with static hosting; `VITE_BASE_PATH=/` supports a domain-root Cloudflare Pages deployment. Route-level lazy loading keeps the dashboard, charts, payments, and tenant detail out of the initial bundle.

Supabase provides Auth and PostgreSQL. The browser uses only the publishable/anon key. Database permissions and authenticated mutations are enforced by RLS and SQL functions; service-role keys never belong in frontend code.

## Financial model

- `tenants` stores current rental terms and the current expected payment pointer.
- `tenant_payment_terms` stores effective-dated weekly rates and weekdays so historical terms remain explainable.
- `tenant_payment_charges` stores expected scheduled charges and their original amounts.
- `tenant_payment_adjustments` stores dated, explained changes that increase or reduce a balance without rewriting payment history.
- `payments` stores completed payments and comments.
- `paymentLedger.js` combines persisted charges and payments into a chronological balance view, with a calculated fallback for databases before migrations 007/012.

Payment recording and tenant profile/bike assignment use PostgreSQL RPC functions so related updates can commit atomically.

## Operational UX

The dashboard starts with action-oriented counts for overdue, due-today, upcoming, and outstanding debt. Cards filter the tenant list. Tenant detail is the source of truth for payment entry, comments, scheduled charges, and running balance. Historical expected charges remain visible, while only the nearest charge after today is previewed.

## Performance and deployment

Static assets are deployed to Cloudflare Pages. The service worker caches same-origin frontend assets only; Supabase responses remain network-backed. Supabase queries use explicit field lists where the schema is current, with a legacy fallback on the dashboard while migrations are being rolled out.
