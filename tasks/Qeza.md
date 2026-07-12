# Simplify dashboard metrics and future payment visibility

## Checklist

- [x] Remove the current-month receipts card and tenant CSV export.
- [x] Limit the ledger to one expected charge after today.
- [x] Replace charge generation and trim already-created future charges.
- [x] Update architecture documentation and validate the production build.

## Scope

Past and due-today ledger events remain visible. Only the nearest expected charge strictly after today is shown and retained as a future preview.

## Rollout

Apply `014_limit_future_payment_charges.sql` after migration `013`. It removes already-created future previews beyond the nearest one and replaces the charge-generation function.
