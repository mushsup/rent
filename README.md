# E-Bike Rent Krakow

E-Bike Rent Krakow is a browser-based rental operations dashboard for managing courier e-bikes, tenants, payments, and business credits. It also publishes a tenant-facing rental page through a shareable slug.

## Stack

- React 18 with Vite 5 and JavaScript/JSX
- React Router 7 using `HashRouter` for client-side navigation
- Supabase JS for authentication and direct Postgres access
- TanStack React Query for cached admin queries and invalidation
- Tailwind CSS 4 through `@tailwindcss/vite`
- Recharts for dashboard charts, `date-fns` for date calculations, `lucide-react` for icons, and `react-hot-toast` for feedback

## Runtime architecture

The application is a single-page frontend. `src/main.jsx` creates one React Query client, wraps the app in `React.StrictMode`, and mounts a `HashRouter`. `src/App.jsx` defines the route tree and global toast configuration.

```text
Browser
└── React SPA
    ├── Public marketing page             /
    ├── Public tenant page                /:slug
    └── Authenticated admin shell         /admin/*
        ├── Dashboard                     /admin
        ├── Bike inventory                 /admin/bikes
        ├── Credit/payment operations      /admin/payments
        └── Tenant detail                  /admin/tenant/:id
                │
                └── Supabase JS client
                    ├── Supabase Auth
                    └── Postgres tables + Row Level Security
```

`src/components/Layout.jsx` is the admin route guard: it loads the Supabase session, subscribes to auth changes, redirects unauthenticated users to `/admin/login`, and provides the admin navigation, logout, and dark-mode toggle.

The feature pages currently contain their own query and mutation logic. There is no separate API server, domain service layer, generated database type layer, or shared repository abstraction.

## Data model and migrations

The current frontend expects these Supabase tables and relationships:

- `tenants`: tenant identity, public `slug`, assigned `bike_id`, recurring `weekly_payment`, `payment_day`, payment dates, deposit, comments, and archive state.
- `bikes`: inventory records with `type`, `model`, and status (`available`, `in_rent`, or `maintenance`). Rental terms are not stored on inventory.
- `payments`: tenant payment records linked by `tenant_id`.
- `credits`: business credit records used by the payments page and dashboard.
- `credit_transactions`: payments/additions linked to credits and consumed by `calculateCreditDebt`.

Schema changes in `src/lib/migrations/` are incremental:

1. `001_restructure.sql` adds `bikes`, links it to `tenants`, and removes legacy tenant/payment columns.
2. `002_add_next_payment_date.sql` adds the next expected tenant payment date.
3. `003_add_tenant_fields.sql` adds the expected amount and deposit.
4. `004_move_rental_terms_to_tenants.sql` moves recurring rental terms from bikes to tenants and removes `bikes.price`.
5. `005_repair_zero_weekly_payments.sql` restores zero recurring payments from existing tenant payment history after the move.
6. `006_add_payment_comments.sql` adds comments to expected and completed payments.
7. `007_add_payment_terms_history.sql` preserves historical weekly rates and payment weekdays.
8. `008_manage_payment_terms_rpc.sql` updates payment-term history without overlapping effective periods.
9. `009_record_payment_rpc.sql` records a payment and advances the next scheduled date atomically.
10. `010_harden_service_rls.sql` enables RLS and authenticated-admin policies for inventory and credit tables.

`supabase_setup.sql` is an older bootstrap script and does not describe the current schema completely. Do not use it alone for a fresh environment: reconcile it with the migrations and the queries in `src/pages/admin/` before provisioning a new database. In particular, the current application also queries `credits`, `credit_transactions`, `bikes`, `is_archived`, and newer tenant fields.

## Environment and local development

Create a local `.env` file with the public Supabase client configuration:

```text
VITE_SUPABASE_URL=https://<project>.supabase.co
VITE_SUPABASE_ANON_KEY=<publishable-anon-key>
```

Only the publishable/anon key belongs in this frontend. Never expose a Supabase service-role key or other privileged secret in `VITE_*` variables.

### Free static deployment

The production frontend is suitable for a free Cloudflare Pages static deployment:

- Build command: `npm run build`
- Publish directory: `dist`
- Environment variables: `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`
- Current URL base: `/rent/`; change `vite.config.js` to `/` when deploying at a domain root.

The repository includes a service worker for repeat-load caching of same-origin static assets. It never caches Supabase API responses, so tenant and payment data remain live. The generated manifest allows installation as a phone home-screen app when the site is served over HTTPS.

Install dependencies and start the development server:

```bash
npm install
npm run dev
```

### Run locally for testing

1. Use a current Node.js LTS release and install the dependencies with `npm install`.
2. Create `.env` in the repository root with a Supabase project URL and anon/publishable key.
3. Provision the current Supabase schema, including the tables listed above, migrations, RLS policies, at least one authenticated admin user, and optional test tenant/bike/payment data. The legacy `supabase_setup.sql` file is not sufficient by itself.
4. Start Vite with `npm run dev` and open the URL printed in the terminal. With the configured base path, the usual address is `http://localhost:5173/rent/`.
5. Test the public experience at `/rent/` and a tenant link at `/rent/#/<tenant-slug>`.
6. Test the admin flow at `/rent/#/admin/login` using the Supabase authenticated user. Verify the dashboard, bike inventory, payments/credits, tenant detail, payment recording, bike assignment, archive, logout, and dark-mode toggle.
7. Before submitting changes, run `npm run build`. Run `npm run lint` as well; the current repository has documented pre-existing lint failures in the audit baseline.

Because the app uses `HashRouter`, route paths after the base path must include `#` during local testing. Changes to `.env` require restarting the Vite process.

Available scripts:

- `npm run dev` — start Vite with HMR.
- `npm run build` — create the production bundle in `dist/`.
- `npm run preview` — serve the production bundle locally.
- `npm run lint` — run ESLint across the repository.

Vite is configured with `base: '/rent/'`, so deployments must serve the app under `/rent/` unless that setting and the deployment path are changed together. Because routing uses `HashRouter`, the host does not need history-fallback rewrites for client routes.

## Main workflows

### Public tenant view

`TenantPublic` loads a tenant by `slug`, including its assigned bike and payment history. `calculateDebt` treats the configured next payment date as the current expected obligation and calculates an overdue amount when that date is today or earlier.

### Admin operations

The dashboard lists tenants, filters archived/payment status, summarizes bike availability and revenue, and records fast payments. Bike management supports inventory CRUD, status filtering, and assignment cleanup. Tenant detail supports editing, payment CRUD, archiving, and bike reassignment. The payments page tracks credits and credit transactions; `calculateCreditDebt` applies daily interest, dated transactions, and regular payment days.

Admin reads use TanStack Query with a five-minute stale time and explicit invalidation after mutations. Supabase calls remain in page components rather than behind an API boundary.

## Audit baseline

The production build currently succeeds (`npm run build`). `npm run lint` currently fails with existing issues, including unused imports/variables, missing React prop validation, an invalid regular expression in `fixTheme.js`, and undefined references in `AdminDashboard.jsx` and `AdminTenantDetail.jsx`. Treat lint as a required cleanup item before merging application changes.

Security depends on Supabase Row Level Security, not on route visibility. The public tenant route is intentionally anonymous, while admin writes rely on authenticated Supabase sessions. Verify policies for every current table—especially `bikes`, `credits`, and `credit_transactions`—when maintaining the database. The browser currently queries tenant/payment data directly, so public policies must expose only the minimum fields and rows intended for tenant links.

## Repository layout

```text
src/
├── components/       Shared layout and route guard
├── lib/              Supabase client and SQL migrations
├── pages/            Public and admin route-level components
├── utils/            Pure debt-calculation functions
├── App.jsx           Route tree and global toaster
├── main.jsx          React, Query Client, and router bootstrap
├── App.css           Legacy starter styles (most UI uses Tailwind)
└── index.css         Tailwind entrypoint and global styles
```

When changing the schema, update the migration history and the affected page queries together. When changing financial calculations, update the pure utility and add focused tests before changing UI code.
