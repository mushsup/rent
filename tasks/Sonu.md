# Fix confirmed runtime failures in tenant deletion and dashboard fast payment

## Substeps

- [ ] Update `src/pages/admin/AdminTenantDetail.jsx` so tenant deletion captures and checks the payment and tenant deletion results.
- [ ] Update `src/pages/admin/AdminDashboard.jsx` to remove the undefined `setOpenMenuId` call and preserve fast-payment behavior.
- [ ] Exercise both actions manually with successful and failed Supabase responses.

## Priority

Critical. These actions currently crash or leave incomplete data.
