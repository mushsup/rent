export const queryKeys = {
  bikes: {
    all: ['bikes'] as const,
    dashboard: ['bikes', 'dashboard'] as const,
    rentalOptions: ['bikes', 'rental-options'] as const,
  },
  batteries: {
    all: ['batteries'] as const,
  },
  tasks: {
    all: ['bike-tasks'] as const,
    byBike: (bikeId: string) => ['bike-tasks', 'bike', bikeId] as const,
  },
  tenants: {
    // 'all' is the common prefix: invalidating it refreshes every tenant query.
    all: ['tenants'] as const,
    detail: (tenantId: string) => ['tenants', 'detail', tenantId] as const,
    dashboard: (showArchived: boolean) => ['tenants', 'dashboard', showArchived] as const,
    // Prefix without the archived flag: invalidates both dashboard variants.
    dashboards: ['tenants', 'dashboard'] as const,
    publicHistory: (slug: string) => ['public-tenant-history', slug] as const,
    paymentApprovals: ['tenants', 'payment-approvals'] as const,
    paymentRequests: ['tenants', 'payment-requests'] as const,
  },
  credits: {
    all: ['credits'] as const,
  },
};
