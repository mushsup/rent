# Reconcile database migrations with the current application schema

## Substeps

- [ ] Inventory every table and column queried by `src/pages/admin/` and `src/pages/TenantPublic.jsx`.
- [ ] Add ordered migrations for missing tables and fields, including `is_archived`, `credits`, and `credit_transactions`.
- [ ] Add required constraints and indexes for slugs, bike assignment, statuses, dates, and non-negative money values.
- [ ] Replace or clearly retire the stale bootstrap schema in `supabase_setup.sql`.
- [ ] Validate a fresh database setup and an upgrade from the existing schema.

## Priority

High. The repository does not currently provide a reproducible schema matching the frontend.
