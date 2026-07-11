# Reduce Android startup cost and repeated credit-calculation work

## Substeps

- [ ] Lazy-load admin route components and chart-heavy dependencies so the public route does not load the admin bundle.
- [ ] Replace wildcard dashboard queries with minimal projections and bounded payment-history queries.
- [ ] Pre-index credit transactions and memoize or move historical debt aggregation out of render-time loops.
- [ ] Add a mobile payment action that remains available below the `sm` breakpoint.
- [ ] Measure production load and interaction performance on a representative Android device.

## Priority

Medium-high. The current bundle is about 884 KB uncompressed, and daily debt loops can grow with credit history.
