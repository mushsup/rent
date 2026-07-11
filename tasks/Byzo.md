# Add database and form validation for financial and assignment data

## Substeps

- [ ] Validate numeric inputs before conversion and reject empty, negative, non-finite, and invalid values.
- [ ] Add database checks for prices, deposits, payment amounts, interest rates, payment days, and bike statuses.
- [ ] Enforce one active tenant assignment per bike at the database level.
- [ ] Handle duplicate slugs and invalid date ranges with user-visible errors.

## Priority

High. Client-only validation currently permits invalid financial and relationship state.
