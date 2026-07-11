# Improve operations, financial reliability, and performance

## Checklist

- [ ] Add durable tenant payment terms and payment-event migrations.
- [ ] Replace schedule-only balance assumptions with persisted financial events.
- [ ] Add an operational dashboard queue for overdue and upcoming payments.
- [ ] Add explicit query error states and protect authenticated mutations.
- [ ] Split route-level bundles and verify the production performance path.
- [ ] Run the full validation suite and document rollout steps.

## Scope

The goal is to make the rental panel reliable for daily operations without replacing the existing React/Vite/Supabase architecture. Historical financial records must remain explainable after rate, weekday, or payment-date changes.
