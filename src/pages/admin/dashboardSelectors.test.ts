import { describe, expect, it } from 'vitest';
import type { Bike, Tenant } from '../../types';
import {
    buildRevenueChartData,
    buildTenantSummaries,
    filterDashboardTenants,
    getDashboardStats,
    needsBikeAssignment
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

    it('estimates revenue only from active tenants with an assigned bike', () => {
        const tenants = buildTenantSummaries([
            tenant({ weekly_payment: 200 }),
            tenant({ id: 'without-bike', bike_id: null, weekly_payment: 600 }),
            tenant({ id: 'archived', is_archived: true, weekly_payment: 800 }),
        ], referenceDate);

        const stats = getDashboardStats(tenants, [], referenceDate);

        expect(stats.activeWeeklyRevenue).toBe(200);
        expect(stats.activeMonthlyRevenue).toBe(867);
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

    it('puts active tenants without a bike first', () => {
        const tenants = buildTenantSummaries([
            tenant({ id: 'overdue', name: 'Overdue', payment_charges: [{ id: 'old', due_date: '2026-01-01', amount: 100, status: 'open' }] }),
            tenant({ id: 'no-bike', name: 'No bike', bike_id: null, next_payment_date: null }),
            tenant({ id: 'archived-no-bike', name: 'Archived', bike_id: null, is_archived: true }),
        ], referenceDate);

        const result = filterDashboardTenants(tenants, {
            search: '',
            showArchived: false,
            tenantFilter: 'all',
            referenceDate
        });

        expect(result.map(item => item.id)).toEqual(['no-bike', 'overdue']);
        expect(needsBikeAssignment(result[0])).toBe(true);
        expect(needsBikeAssignment(tenants[2])).toBe(false);
    });

    it('counts only unapproved open charges due today', () => {
        const tenants = buildTenantSummaries([
            tenant({ payment_charges: [
                { id: 'pending', due_date: '2026-08-23', amount: 300, approved_at: null, status: 'open' },
                { id: 'approved', due_date: '2026-08-23', amount: 200, approved_at: '2026-08-22T10:00:00Z', status: 'open' },
                { id: 'waived', due_date: '2026-08-23', amount: 100, approved_at: null, status: 'waived' }
            ] })
        ], referenceDate);

        expect(getDashboardStats(tenants, [], referenceDate).dueTodayCount).toBe(1);
    });

    it('counts charges, not tenants, for the due-today work queue', () => {
        const tenants = buildTenantSummaries([
            tenant({ id: 'busy', payment_charges: [
                { id: 'one', due_date: '2026-08-23', amount: 100, status: 'open' },
                { id: 'two', due_date: '2026-08-23', amount: 100, status: 'open' },
            ] })
        ], referenceDate);
        const stats = getDashboardStats(tenants, [], referenceDate);

        expect(stats.dueTodayCount).toBe(2);
        expect(stats.todayDebtorCount + stats.todayNonDebtorCount).toBe(1);
    });

    it('reports zero utilization without usable bikes', () => {
        const tenants = buildTenantSummaries([tenant()], referenceDate);

        expect(getDashboardStats(tenants, [], referenceDate).utilizationRate).toBe(0);
        expect(getDashboardStats(tenants, [{ id: '1', status: 'maintenance' }], referenceDate).utilizationRate).toBe(0);
    });

    it('filters by overdue, today and debt consistently', () => {
        const tenants = buildTenantSummaries([
            tenant({ id: 'old', payment_charges: [{ id: 'o', due_date: '2026-01-01', amount: 100, status: 'open' }] }),
            tenant({ id: 'now', payment_charges: [{ id: 'n', due_date: '2026-08-23', amount: 100, status: 'open' }] }),
            tenant({ id: 'clear', payment_charges: [{ id: 'c', due_date: '2026-08-23', amount: 100, status: 'open' }], payments: [{ amount: 100, payment_date: '2026-08-23' }] }),
        ], referenceDate);
        const options = { search: '', showArchived: false, referenceDate };

        expect(filterDashboardTenants(tenants, { ...options, tenantFilter: 'overdue' }).map(item => item.id)).toEqual(['old']);
        // 'clear' paid in full the same day: nothing outstanding, out of the queue.
        expect(filterDashboardTenants(tenants, { ...options, tenantFilter: 'today' }).map(item => item.id)).toEqual(['now']);
        expect(filterDashboardTenants(tenants, { ...options, tenantFilter: 'debt' }).map(item => item.id).sort()).toEqual(['now', 'old'].sort());
    });

    it('forecasts the current week from the payment pace', () => {
        const midWeek = new Date('2026-08-19T12:00:00');
        const tenants = [tenant({ payments: [{ amount: 300, payment_date: '2026-08-18' }] })];

        const points = buildRevenueChartData(tenants, 'week', midWeek, 'payments');
        const current = points[points.length - 1];

        // Three days elapsed (Mon-Wed): 300 / 3 * 7 = 700.
        expect(current.amount).toBe(700);
        expect(current.fullLabel).toContain('прогноз по темпу оплат');
    });

    it('charges chart excludes waived charges', () => {
        const tenants = [tenant({ payment_charges: [
            { id: 'open', due_date: '2026-08-01', amount: 100, status: 'open' },
            { id: 'waived', due_date: '2026-08-01', amount: 500, status: 'waived' },
        ] })];

        const points = buildRevenueChartData(tenants, 'month', referenceDate, 'charges');
        expect(points).toEqual([expect.objectContaining({ date: '2026-08-01', amount: 100 })]);
    });

    it('debt chart always returns the full window', () => {
        expect(buildRevenueChartData([tenant()], 'month', referenceDate, 'debt')).toHaveLength(12);
        expect(buildRevenueChartData([tenant()], 'year', referenceDate, 'debt')).toHaveLength(5);
    });

    it('groups payments by year', () => {
        const tenants = [tenant({ payments: [
            { amount: 100, payment_date: '2025-06-01' },
            { amount: 200, payment_date: '2026-06-01' },
        ] })];

        expect(buildRevenueChartData(tenants, 'year', referenceDate)).toEqual([
            expect.objectContaining({ date: '2025-01-01', amount: 100 }),
            expect.objectContaining({ date: '2026-01-01', amount: 200 }),
        ]);
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
