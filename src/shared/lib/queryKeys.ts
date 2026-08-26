export const queryKeys = {
  bikes: {
    all: ['bikes'] as const,
    tenants: ['tenants', 'bikes'] as const,
  },
  tasks: {
    all: ['bike-tasks'] as const,
    byBike: (bikeId: string) => ['bike-tasks', 'bike', bikeId] as const,
  },
  tenants: {
    all: ['tenants'] as const,
    detail: (tenantId: string) => ['tenant', tenantId] as const,
    dashboard: (showArchived: boolean) => ['tenants', 'dashboard', showArchived] as const,
    publicHistory: (slug: string) => ['public-tenant-history', slug] as const,
  },
  credits: {
    all: ['credits'] as const,
  },
};
