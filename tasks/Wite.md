# Payment corrections and tenant contacts

## Checklist

- [x] Add contact and correction-event fields through a new SQL migration.
- [x] Include correction events in the payment ledger and running balance.
- [x] Add correction creation and contact editing to the tenant profile.
- [x] Render one-tap phone and Telegram links on the tenant profile.
- [x] Build the production bundle and document beta rollout.

## Scope

Historical expected charges remain immutable. Corrections are separate financial events with a required comment, so the ledger continues to explain why a balance changed.

## Rollout

Apply `013_add_tenant_contacts_and_adjustments.sql` after migrations `001` through `012`. The tenant-detail query requires the new contact and adjustment fields.
