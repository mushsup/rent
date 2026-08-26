import { describe, expect, it } from 'vitest';
import type { Bike, Tenant } from '../../types';
import {
    buildRevenueChartData,
    buildTenantSummaries,
    filterDashboardTenants,
    getDashboardStats
} from './dashboardSelectors';

const referenceDate = new Date('2026-08-23T12:00:00');

function tenant(overrides: Partial<Tenant> = {}): Tenant {
    return {
        id: 'tenant-1',
        name: 'Ilya',
        bike_id: 'bike-1',
        weekly_payment: 100,
        next_payment_date: '2026-08-25',
        payment_charges: [],
        ...overrides
    };
}

describe('dashboard selectors', () => {
    it('builds stats from active tenants and bike statuses', () => {
        const tenants = buildTenantSummaries([
            tenant(),
            tenant({ id: 'archived', is_archived: true, weekly_payment: 500 })
        ], referenceDate);
        const bikes: Bike[] = [
            { id: '1', status: 'in_rent' },
            { id: '2', status: 'available' },
            { id: '3', status: 'maintenance' }
        ];

        const stats = getDashboardStats(tenants, bikes, referenceDate);

        expect(stats.activeWeeklyRevenue).toBe(100);
        expect(stats.activeMonthlyRevenue).toBe(433);
        expect(stats.upcomingCount).toBe(1);
        expect(stats.rentedBikesCount).toBe(1);
        expect(stats.utilizationRate).toBe(0.5);
    });

    it('filters archived tenants and upcoming payments without mutating the source', () => {
        const tenants = buildTenantSummaries([
            tenant({ id: 'later', name: 'Zed', next_payment_date: '2026-08-30' }),
            tenant({ id: 'soon', name: 'Ilya', next_payment_date: '2026-08-24' }),
            tenant({ id: 'archived', name: 'Old', is_archived: true })
        ], referenceDate);

        const result = filterDashboardTenants(tenants, {
            search: 'ily',
            showArchived: false,
            tenantFilter: 'upcoming',
            referenceDate
        });

        expect(result.map(item => item.id)).toEqual(['soon']);
        expect(tenants.map(item => item.id)).toEqual(['later', 'soon', 'archived']);
    });

    it('groups payments by the selected chart period', () => {
        const tenants = [tenant({
            payments: [
                { amount: 100, payment_date: '2026-08-20' },
                { amount: 50, payment_date: '2026-08-21' },
                { amount: 25, payment_date: '2026-07-20' }
            ]
        })];

        const result = buildRevenueChartData(tenants, 'month', referenceDate);

        expect(result).toEqual([
            expect.objectContaining({ date: '2026-07-01', amount: 25 }),
            expect.objectContaining({ date: '2026-08-01', amount: 150 })
        ]);
    });
});
