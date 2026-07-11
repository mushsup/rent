# Restore lint-clean error handling and add an application error boundary

## Substeps

- [ ] Fix undefined variables, unused imports, invalid syntax, and prop-validation errors in application code.
- [ ] Make Supabase query functions throw errors and add explicit loading, empty, error, and retry states.
- [ ] Add a top-level React error boundary with a recovery action.
- [ ] Run `npm run lint` and `npm run build`, ensuring no new baseline debt remains.

## Priority

High. The current lint failures include runtime defects, while ignored query errors can misrepresent outages as empty data.
