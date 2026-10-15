# Restrict public Supabase data access and review authenticated policies

## Substeps

- [x] Define the exact columns required by `TenantPublic` and replace its wildcard query with a minimal public projection.
- [x] Add or revise RLS policies so anonymous access is limited to the intended tenant slug and public payment data.
- [x] Verify authenticated policies for tenants, payments, bikes, credits, and credit transactions.
- [ ] Test anonymous tenant access, direct table queries, and authenticated admin operations against a non-production project.

## Priority

Critical. The current bootstrap policies expose all tenants and payments to anonymous callers.
