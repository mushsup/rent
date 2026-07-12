# Improve operations, financial reliability, and performance

## Checklist

- [x] Add durable tenant payment terms and payment-charge migrations.
- [x] Replace schedule-only balance assumptions with persisted financial charges and a fallback ledger.
- [x] Add an operational dashboard queue for overdue and upcoming payments.
- [x] Add explicit query error states and protect authenticated mutations.
- [x] Split route-level bundles and verify the production performance path.
- [x] Run the production build, record the existing lint baseline, and document rollout steps.

## Scope

The goal is to make the rental panel reliable for daily operations without replacing the existing React/Vite/Supabase architecture. Historical financial records must remain explainable after rate, weekday, or payment-date changes.

## Rollout

Apply migrations `007` through `012` in order in the production Supabase project. Verify authenticated payment creation, tenant updates, bike assignment, public tenant links, and RLS policies before using the new RPC functions in production.
