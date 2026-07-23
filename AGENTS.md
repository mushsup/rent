# AGENTS.md

## Project context

This repository is a React 18 single-page application built with Vite 5. It uses TypeScript/TSX, React Router 7 with `HashRouter`, TanStack React Query, Tailwind CSS 4, Supabase Auth/Postgres, and feature-level API modules. The deploy base path is `/rent/`.

## Working agreements

- Read `README.md` before changing routing, deployment, or database-facing behavior.
- Keep changes narrow and follow the feature organization. Keep Supabase access in feature API modules and financial rules in pure domain utilities.
- Use `apply_patch` for edits. Delete only confirmed dead files or artifacts.
- Keep user-visible copy consistent with the existing Russian-language UI unless the task explicitly changes localization.
- Preserve unrelated working-tree changes and inspect `git diff` before finishing.
- Use Conventional Commits when a commit is requested, for example `fix(admin): handle tenant deletion error`.

## React and component practices

- Use function components and hooks. Keep route-level data loading close to the page until there is demonstrated duplication.
- Add a docstring-style comment only for non-obvious calculation or data-flow behavior; do not add comments that merely restate JSX.
- Keep derived values pure and memoization purposeful. Do not add `useMemo` or `useCallback` without a measured or clear dependency benefit.
- Use stable keys, accessible labels, semantic buttons/links, and keyboard-operable dialogs and menus.
- Keep loading, empty, error, and mutation-failure states explicit. Supabase errors must not be silently ignored.
- Remove unused imports and state when editing a component. Treat ESLint errors as blocking for new work.
- If adding reusable components, define and validate their props consistently with the project’s JavaScript conventions; do not mix in TypeScript solely for prop typing.

## Routing and authentication

- Add routes in `src/App.tsx`; remember that the app uses `HashRouter`, so URLs are hash-based in production.
- Keep all admin pages under the authenticated `Layout` route. Do not treat a hidden link or client-side redirect as authorization.
- Use Supabase Auth session state for access control and preserve the existing redirect to `/admin/login`.
- Do not put service-role keys, database passwords, or other privileged credentials in source, `VITE_*` variables, or browser storage.

## Supabase and database practices

- Use the public Supabase URL and anon/publishable key only in the browser client.
- Check and handle `{ data, error }` for every Supabase read/write. Mutations that update related rows (for example tenant assignment and bike status) should surface partial-failure risk rather than reporting success blindly.
- Add schema changes as a new ordered migration under `src/lib/migrations/`; never rewrite an already-applied migration.
- Keep `supabase_setup.sql` synchronized or clearly marked when the schema evolves. The current app requires `tenants`, `bikes`, `payments`, `credits`, and `credit_transactions`, plus fields added by the migrations.
- Review Row Level Security policies whenever a table or query changes. Public tenant links are intentional, but public access must be limited to the minimum tenant/payment data required by `TenantPublic`.
- Prefer database constraints for uniqueness, valid statuses, foreign keys, and non-negative financial values. Do not rely only on form validation.
- Preserve date-only fields as ISO `yyyy-MM-dd` values. Normalize dates before comparisons and avoid locale-dependent parsing.

## React Query practices

- Use query keys that include route identifiers and other query inputs.
- Invalidate the smallest affected keys after a mutation; update related tenant, bike, and dashboard queries when a relationship changes.
- Keep the existing five-minute default stale time unless the task explicitly changes freshness expectations.
- Do not mix ad-hoc fetch state and React Query for the same resource without documenting why.

## Financial calculations

- Keep debt logic in pure utilities such as `src/utils/calculateDebt.ts` and `src/utils/calculateCreditDebt.ts`.
- Treat money as numeric values at the persistence boundary and avoid introducing floating-point accumulation for new financial workflows without a deliberate rounding strategy.
- Add focused tests for overdue boundaries, same-day payments, date/time-zone behavior, zero/negative balances, interest accrual, and transaction ordering before changing calculations.
- Never use UI formatting as the source of truth for a stored amount or date.

## Styling and assets

- Use Tailwind utility classes and the existing dark-mode variant. Keep global CSS in `src/index.css`; avoid adding component-specific global selectors.
- Preserve responsive behavior for narrow screens and verify dialogs, tables, and navigation at mobile widths.
- Respect reduced-motion preferences when adding animations.

## Validation checklist

Run the smallest relevant checks, then the full checks before handoff:

```bash
npm run lint
npm run build
```

For database-facing changes, verify the migration against a non-production Supabase project and manually exercise anonymous tenant access, authenticated admin access, failed mutations, and related-row consistency. The repository’s current baseline builds successfully but lint is not clean; new changes must not increase that debt and should fix touched-file errors where practical.
