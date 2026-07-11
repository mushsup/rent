# Define and correct tenant debt and payment-date calculations

## Substeps

- [ ] Specify expected behavior for full payments, partial payments, late payments, deleted payments, and multiple overdue periods.
- [ ] Update `src/utils/calculateDebt.js` to calculate debt from payment data according to the agreed rules.
- [ ] Centralize date-only parsing so `yyyy-MM-dd` values are not affected by timezone conversion.
- [ ] Add focused tests for same-day, overdue, partial, deleted, and timezone-boundary cases.

## Priority

Critical. The current calculation reports the full expected amount whenever a due date is reached and does not apply payment amounts to current debt.
