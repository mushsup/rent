# E-Bike Rent Krakow

E-Bike Rent Krakow is a browser-based rental operations dashboard for managing courier e-bikes, tenants, payments, and business credits. It also publishes a tenant-facing rental page through a shareable slug.

## Stack

- React 18 with Vite 8 and TypeScript/TSX
- React Router 7 using `BrowserRouter`: the admin lives at `/`, tenant pages at `/:slug` and `/history/...`
- Supabase JS for authentication and direct Postgres access
- TanStack React Query for cached admin queries and invalidation
- Tailwind CSS 4 through `@tailwindcss/vite`
- Small custom SVG charts, `date-fns` for date calculations, `lucide-react` for icons, and `react-hot-toast` for feedback

## Runtime architecture

The application is a single-page frontend. `src/main.tsx` creates one React Query client, wraps the app in `React.StrictMode`, and mounts a `BrowserRouter`. `src/App.tsx` defines the route tree and global toast configuration.

```text
Browser
└── React SPA
    ├── Admin shell (inline login)        /
    │   ├── Dashboard                     /
    │   ├── Bike inventory                 /bikes
    │   ├── Credit/payment operations      /payments
    │   ├── Bike task manager              /tasks
    │   └── Tenant detail                  /tenant/:id
    ├── Admin URL alias                   /admin/* → same paths without prefix
    └── Public tenant pages               /:slug and /history/:slug/...
                │
                └── Supabase JS client
                    ├── Supabase Auth
                    └── Postgres tables + Row Level Security
```

`src/components/Layout.tsx` is the admin route guard: it loads the Supabase session, subscribes to auth changes, renders the login form inline when there is no session (no redirects), and provides the admin navigation, logout, and dark-mode toggle.

Supabase access for tenant workflows is centralized in `src/features/tenants/api.ts`. Pure financial calculations remain in `src/utils/`, while route components focus on UI state and rendering.

## Data model and migrations

The current frontend expects these Supabase tables and relationships:

- `tenants`: tenant identity, public `slug`, assigned `bike_id`, recurring `weekly_payment`, `payment_day`, payment dates, deposit, comments, and archive state.
- `bikes`: inventory records with `type`, `model`, and status (`available`, `in_rent`, or `maintenance`). Rental terms are not stored on inventory.
- `payments`: tenant payment records linked by `tenant_id`.
- `credits`: business credit records used by the payments page and dashboard.
- `credit_transactions`: payments/additions linked to credits and consumed by `calculateCreditDebt`.
- `bike_tasks`: maintenance and operational tasks linked to a bike, with status, priority, and optional due date.

Schema changes in `supabase/migrations/` are incremental and use Supabase CLI timestamp versions:

1. `001_restructure.sql` adds `bikes`, links it to `tenants`, and removes legacy tenant/payment columns.
2. `002_add_next_payment_date.sql` adds the next expected tenant payment date.
3. `003_add_tenant_fields.sql` adds the expected amount and deposit.
4. `004_move_rental_terms_to_tenants.sql` moves recurring rental terms from bikes to tenants and removes `bikes.price`.
5. `005_repair_zero_weekly_payments.sql` restores zero recurring payments from existing tenant payment history after the move.
6. `006_add_payment_comments.sql` adds comments to expected and completed payments.
7. `007_add_payment_terms_history.sql` preserves historical weekly rates and payment weekdays.
8. `008_manage_payment_terms_rpc.sql` updates payment-term history without overlapping effective periods.
9. `009_record_payment_rpc.sql` records a payment and advances the next scheduled date atomically.
10. `009a_add_operational_tables.sql` adds archive state, credits, and credit transactions required by the operations pages.
11. `010_harden_service_rls.sql` enables RLS and authenticated-admin policies for inventory and credit tables.
12. `011_update_tenant_profile_rpc.sql` saves tenant terms and bike assignment atomically.
13. `012_persist_payment_charges.sql` persists expected weekly charges for an explainable payment ledger.
14. `013_add_tenant_contacts_and_adjustments.sql` adds tenant phone/Telegram contacts and immutable balance corrections.
15. `014_limit_future_payment_charges.sql` retains only the nearest expected charge after today.
16. `015`–`022` repair legacy payment dates, schedule automatic charges, harden rental/payment workflows, expose the public financial summary, make bike assignment atomic, and enforce financial invariants.
17. `023_add_bike_tasks.sql` adds the authenticated bike task manager table and its indexes/RLS policy.
18. `024_google_tasks_sync.sql` adds stable voice codes, external sync metadata, soft deletion, and update tracking for bidirectional Google Tasks synchronization.
19. `025_bike_type_voice_codes.sql` assigns `m1…` codes to MTB bikes and `f1…` codes to FAT bikes, with automatic numbering for new inventory.
20. `20260822000001_allow_bike_reassignment.sql` synchronizes bike status and makes reassignment close the previous rental.
21. `20260823000001_atomic_tenant_profile_update.sql` keeps contacts and battery configuration inside the tenant create/update transactions.
22. `20260823000002_enforce_rental_invariants.sql` enforces one-bike-per-tenant uniqueness, valid bike statuses, rejects hidden rental-ending side effects during inventory edits, and removes superseded RPC overloads.

`supabase_setup.sql` is retained only as a historical bootstrap reference. A new environment must be provisioned from the ordered migrations. The baseline migration plus the incremental history reproduce the current schema.

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
- Current URL base: `/` (domain root; `vite.config.js` uses `base: '/'`).

The repository includes a service worker for repeat-load caching of same-origin static assets and an installable PWA manifest. Successful read results are saved in IndexedDB for up to 48 hours, so the latest dashboard can render immediately and refresh in the background. Supabase remains the source of truth; writes still require a connection and the local cache is cleared on logout.

Install dependencies and start the development server:

```bash
npm install
npm run dev
```

### Run locally for testing

1. Use a current Node.js LTS release and install the dependencies with `npm install`.
2. Create `.env` in the repository root with a Supabase project URL and anon/publishable key.
3. Start Docker and run `npm run db:reset` to reproduce the schema locally. The migration that introduces `admin_users` promotes Auth users that already exist when it is applied; add later operators explicitly to that table.
4. Start Vite with `npm run dev` and open the URL printed in the terminal, usually `http://localhost:5173/`.
5. Test a tenant link at `/<tenant-slug>` and its `/history/<tenant-slug>/statement` page.
6. Test the admin flow at `/` using the Supabase authenticated user (without a session the login form renders inline on the same URL). Verify the dashboard, bike inventory, payments/credits, tenant detail, payment recording, bike assignment, archive, logout, and dark-mode toggle.
7. Before submitting changes, run `npm run lint`, `npm run typecheck`, `npm test`, `npm run build`, `npm run check:bundle`, and `npm run test:e2e`.

The app uses `BrowserRouter` with clean URLs. `netlify.toml` rewrites all paths to `/index.html` (HTTP 200, URL unchanged) so deep links and refreshes work on static hosting. Changes to `.env` require restarting the Vite process.

Available scripts:

- `npm run dev` — start Vite with HMR.
- `npm run build` — create the production bundle in `dist/`.
- `npm run deploy` — build and deploy the production bundle to Netlify.
- `npm run preview` — serve the production bundle locally.
- `npm run lint` — run ESLint across the repository.
- `npm run typecheck` — run TypeScript without emitting files.
- `npm test` — run focused unit tests.
- `npm run check` — run typechecking, lint, unit tests, production build, and bundle budgets.
- `npm run check:rpc` — verify that frontend RPC calls exist in migrations and generated database types.
- `npm run check:remote-schema` — read-only check that the linked target schema has the current RPC signatures and rental invariants.
- `npm run test:e2e` — run Playwright in desktop and mobile Chromium projects.
- `npm run db:reset` — rebuild the local Supabase database from standard migrations.
- `npm run db:types` — regenerate `src/database.types.ts` from the linked Supabase schema.

Vite is configured with `base: '/'`, so deployments serve the app at the domain root. `/` renders the admin dashboard (login form inline until a session exists), `/admin` and `/admin/*` are aliases that redirect to the same admin paths, and `/:slug` and `/history/...` render tenant pages. Static routes take precedence over `/:slug`; tenant slugs in `RESERVED_SLUGS` (`src/utils/slug.ts`) can never shadow them.

## Main workflows

### Public tenant view

`PaymentHistory` loads a tenant by `slug`, including its assigned bike and payment history. `calculateDebt` treats the configured next payment date as the current expected obligation and calculates an overdue amount when that date is today or earlier.

### Admin operations

The dashboard lists tenants, filters archived/payment status, summarizes bike availability and revenue, and records fast payments. Bike management supports inventory CRUD, status filtering, and assignment cleanup. Tenant detail supports editing, payment CRUD, archiving, and bike reassignment. The payments page tracks credits and credit transactions; `calculateCreditDebt` applies daily interest, dated transactions, and regular payment days.

Admin reads use TanStack Query with a five-minute stale time and explicit invalidation after mutations. Tenant queries and mutations are centralized in `src/features/tenants/api.ts`.

### Google Tasks voice capture

Bike tasks can be mirrored bidirectionally with a Google Tasks list named
`E-Bike`. Gemini Live creates tasks in that list from voice commands, while a
Google Apps Script synchronizes title, description, due date, completion, and
deletion with Supabase every five minutes. Each bike has a stable voice code
such as `m12` or `f3`; including that code in the spoken command assigns the task to
the correct bike. Tasks with no recognized code are imported without a bike and
can be assigned from the admin task editor.

The sync endpoint is implemented by the `google-tasks-sync` Supabase Edge
Function and is protected by the `GOOGLE_TASKS_SYNC_SECRET` function secret.
The matching Apps Script source and one-time setup instructions are in
`integrations/google-tasks/`. Never commit the local
`.google-tasks-sync-secret` file.

## Quality baseline

The production build, ESLint, and TypeScript checks are expected to pass before changes are merged. Financial calculations should be covered by focused tests before changing their behavior.

Security depends on Supabase Row Level Security, not on route visibility. Direct table access requires membership in `admin_users`; creating an Auth account alone does not grant operational access. The anonymous tenant route calls only `get_public_tenant_profile`, which returns its limited financial projection without exposing direct table reads.

## Repository layout

```text
src/
├── components/       Shared layout and route guard
├── lib/              Typed Supabase client
├── shared/           Query keys, formatting, errors, and UI primitives
├── pages/            Public and admin route-level components
├── utils/            Pure debt-calculation functions
├── features/         Feature-level API modules and reusable feature code
├── App.tsx           Route tree and global toaster
├── main.tsx          React, Query Client, and router bootstrap
└── index.css         Tailwind entrypoint and global styles
```

When changing the schema, update the migration history and the affected page queries together. When changing financial calculations, update the pure utility and add focused tests before changing UI code.
