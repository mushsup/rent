import {
    addDays,
    format,
    isAfter,
    parseISO,
    startOfMonth,
    startOfWeek,
    startOfYear,
    subMonths,
    subWeeks,
    subYears
} from 'date-fns';
import { calculateDebt, getTenantWeeklyPayment } from '../../utils/calculateDebt';
import { formatRussianDate } from '../../utils/russianDate';
import type { Bike, Tenant } from '../../types';

export type ChartPeriod = 'week' | 'month' | 'year';
export type TenantFilter = 'all' | 'overdue' | 'today' | 'upcoming' | 'debt';
export type TenantSummary = Tenant & { debtSummary: ReturnType<typeof calculateDebt> };
export type ChartPoint = { date: string; label: string; fullLabel: string; amount: number };

export function buildTenantSummaries(tenants: Tenant[], referenceDate: Date | string = new Date()): TenantSummary[] {
    return tenants.map(tenant => ({
        ...tenant,
        debtSummary: calculateDebt(tenant, tenant.payments, referenceDate)
    }));
}

export function getDashboardStats(
    tenants: TenantSummary[],
    bikes: Bike[],
    referenceDate: Date = new Date()
) {
    const activeTenants = tenants.filter(tenant => !tenant.is_archived);
    const tenantDebt = activeTenants.map(tenant => ({ tenant, debt: tenant.debtSummary }));
    const todayKey = format(referenceDate, 'yyyy-MM-dd');
    const nextSevenDaysKey = format(addDays(referenceDate, 7), 'yyyy-MM-dd');
    const rentedBikesCount = bikes.filter(bike => bike.status === 'in_rent').length;
    const maintBikesCount = bikes.filter(bike => bike.status === 'maintenance').length;
    const totalBikesCount = bikes.length;
    const activeWeeklyRevenue = activeTenants.reduce((sum, tenant) => sum + getTenantWeeklyPayment(tenant), 0);

    return {
        activeWeeklyRevenue,
        activeMonthlyRevenue: Math.round(activeWeeklyRevenue * 4.33),
        totalBikesCount,
        rentedBikesCount,
        maintBikesCount,
        availBikesCount: bikes.filter(bike => bike.status === 'available').length,
        utilizationRate: rentedBikesCount / Math.max(totalBikesCount - maintBikesCount, 1),
        overdueCount: tenantDebt.filter(({ debt }) => debt.isOverdue).length,
        dueTodayCount: tenantDebt.filter(({ debt }) => debt.hasDueToday).length,
        upcomingCount: tenantDebt.filter(({ tenant, debt }) => isDueWithinNextDays(tenant, debt.nextPaymentDate, todayKey, nextSevenDaysKey)).length,
        totalOutstandingDebt: tenantDebt.reduce((sum, { debt }) => sum + debt.totalDebt, 0)
    };
}

function isDueWithinNextDays(
    tenant: Tenant,
    nextPaymentDate: Date | null,
    todayKey: string,
    nextSevenDaysKey: string
) {
    if (!tenant.bike_id || Number(tenant.weekly_payment) <= 0 || !nextPaymentDate) return false;
    const dateKey = format(nextPaymentDate, 'yyyy-MM-dd');
    return dateKey >= todayKey && dateKey <= nextSevenDaysKey;
}

export function filterDashboardTenants(
    tenants: TenantSummary[],
    { search, showArchived, tenantFilter, referenceDate = new Date() }: {
        search: string;
        showArchived: boolean;
        tenantFilter: TenantFilter;
        referenceDate?: Date;
    }
) {
    const normalizedSearch = search.toLowerCase();
    const todayKey = format(referenceDate, 'yyyy-MM-dd');
    const nextSevenDaysKey = format(addDays(referenceDate, 7), 'yyyy-MM-dd');

    return tenants
        .filter(tenant => {
            const matchesSearch = (tenant.name || '').toLowerCase().includes(normalizedSearch)
                || (tenant.bikes?.model || '').toLowerCase().includes(normalizedSearch);
            if (!matchesSearch || (showArchived ? !tenant.is_archived : tenant.is_archived)) return false;

            const { debtSummary } = tenant;
            if (tenantFilter === 'overdue' && !debtSummary.isOverdue) return false;
            if (tenantFilter === 'today' && !debtSummary.hasDueToday) return false;
            if (tenantFilter === 'upcoming' && !isDueWithinNextDays(tenant, debtSummary.nextPaymentDate, todayKey, nextSevenDaysKey)) return false;
            if (tenantFilter === 'debt' && debtSummary.totalDebt <= 0) return false;
            return true;
        })
        .sort((a, b) => {
            const timeA = a.debtSummary.oldestUnpaidDate?.getTime() ?? a.debtSummary.nextPaymentDate?.getTime() ?? Infinity;
            const timeB = b.debtSummary.oldestUnpaidDate?.getTime() ?? b.debtSummary.nextPaymentDate?.getTime() ?? Infinity;
            return timeA - timeB;
        });
}

export function buildRevenueChartData(
    tenants: Tenant[],
    chartPeriod: ChartPeriod,
    referenceDate: Date = new Date()
): ChartPoint[] {
    const grouped: Record<string, number> = {};
    const startDate = chartPeriod === 'week'
        ? subWeeks(referenceDate, 12)
        : chartPeriod === 'year'
            ? subYears(referenceDate, 5)
            : subMonths(referenceDate, 12);

    tenants.flatMap(tenant => tenant.payments || []).forEach(payment => {
        const paymentDate = parseISO(payment.payment_date);
        if (!isAfter(paymentDate, startDate)) return;
        const bucket = chartPeriod === 'week'
            ? startOfWeek(paymentDate, { weekStartsOn: 1 })
            : chartPeriod === 'month' ? startOfMonth(paymentDate) : startOfYear(paymentDate);
        const key = format(bucket, 'yyyy-MM-dd');
        grouped[key] = (grouped[key] || 0) + (Number(payment.amount) || 0);
    });

    return Object.keys(grouped).sort().filter(key => grouped[key] > 0).map(key => {
        const date = parseISO(key);
        if (chartPeriod === 'week') {
            const monthLabel = formatRussianDate(date, 'LLL');
            return {
                date: key,
                label: monthLabel.charAt(0).toUpperCase() + monthLabel.slice(1),
                fullLabel: `${formatRussianDate(date, 'd MMM')} - ${formatRussianDate(addDays(date, 6), 'd MMM')}`,
                amount: Math.round(grouped[key])
            };
        }
        const label = chartPeriod === 'month' ? formatRussianDate(date, 'MMM yyyy') : format(date, 'yyyy');
        return { date: key, label, fullLabel: label, amount: Math.round(grouped[key]) };
    });
}
