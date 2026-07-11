# Make tenant, payment, and bike state changes atomic

## Substeps

- [ ] Define a database operation for recording a tenant payment and advancing its next payment date together.
- [ ] Define a database operation for creating a tenant with its bike assignment and initial payment.
- [ ] Define a database operation for changing a bike assignment and synchronizing both bike status and tenant reference.
- [ ] Update the affected page handlers to report failures without claiming success.

## Priority

Critical. Current multi-request workflows can leave partial state after a network or database failure.
