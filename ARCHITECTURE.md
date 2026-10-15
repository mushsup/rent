# Architecture

## Runtime

The project is a React/Vite single-page application deployed as static assets. `BrowserRouter` serves clean URLs from the domain root (`vite.base = '/'`): `/` is the admin dashboard, `/:slug` and `/history/...` are tenant pages, and `netlify.toml` rewrites all paths to `/index.html` (200) for static hosting. There are no in-app route redirects. Route-level lazy loading keeps the dashboard, charts, payments, and tenant detail out of the initial bundle.

Supabase provides Auth and PostgreSQL. The browser uses only the publishable/anon key. Database permissions and authenticated mutations are enforced by RLS and SQL functions; service-role keys never belong in frontend code.

The Supabase CLI configuration and timestamped migrations under `supabase/` manage the application database. The project reference is fixed in package scripts; future remote schema changes use migration files rather than manual SQL Editor changes. `src/database.types.ts` is generated from that schema and types the browser client.

Operational RLS policies call `is_admin()`, backed by the `admin_users` allowlist. Existing operators were retained when this policy was introduced; newly created Auth users have no table access until explicitly added. Anonymous clients cannot select operational tables and can only call the limited public tenant RPC.

## Financial model

- `tenants` stores current rental terms and the current expected payment pointer.
- `tenant_payment_terms` stores effective-dated weekly rates and weekdays so historical terms remain explainable.
- `tenant_payment_charges` stores expected scheduled charges and their original amounts.
- `tenant_payment_adjustments` stores dated, explained changes that increase or reduce a balance without rewriting payment history.
- `payments` stores completed payments and comments.
- `paymentLedger.ts` combines persisted charges and payments into a chronological balance view.

Payment recording and tenant profile/bike assignment use PostgreSQL RPC functions so related updates can commit atomically.

## Operational UX

The dashboard starts with action-oriented counts for overdue, due-today, upcoming, and outstanding debt. Cards filter the tenant list. Tenant detail is the source of truth for payment entry, comments, scheduled charges, and running balance. Historical expected charges remain visible, while only the nearest charge after today is previewed.

## Performance and deployment

Static assets are deployed to Cloudflare Pages. The service worker caches same-origin frontend assets only; Supabase responses remain network-backed. Tenant reads and mutations are kept in `src/features/tenants/api.ts`; route pages own data orchestration, while large forms are isolated in focused components such as `TenantCreateModal`, `TenantLedgerModalForm`, `BikeModal`, and `TenantBikeSelector`. The dashboard loads the heavy revenue chart lazily.

Route chunks are checked after every production build: the shared entry is limited to 450 KiB uncompressed, lazy JavaScript chunks to 60 KiB, and CSS to 90 KiB. GitHub Actions runs lint, transitional-strict typechecking, unit tests, the production build, bundle budgets, and desktop/mobile Playwright tests.

## TypeScript guarantees

TypeScript strict mode is enabled across the application, including strict nullability, explicit parameter types, and `unknown` catch variables. Database RPC arguments are represented in the generated schema types, while pure financial calculations are kept independent from the browser and covered by unit tests.

## Dependency audit

Production audit currently reports the React Router RSC/server-action advisory `GHSA-qwww-vcr4-c8h2`. This application is a client-only `BrowserRouter` SPA and does not enable React Server Components, framework mode, actions, loaders, or server rendering, so the vulnerable execution path is not present. The available npm remediation is a downgrade to 7.11, which reintroduces several older router advisories; remain on the current patched 7.x release and reassess when an upstream version outside the advisory range is published.
