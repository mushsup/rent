import {
    addDays,
    addMonths,
    addYears,
    differenceInCalendarDays,
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
export type ChartMetric = 'payments' | 'charges' | 'debt';
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
    const rentingTenants = activeTenants.filter(tenant => Boolean(tenant.bike_id));
    const tenantDebt = activeTenants.map(tenant => ({ tenant, debt: tenant.debtSummary }));
    const debtByTenantId = new Map(tenantDebt.map(({ tenant, debt }) => [tenant.id, debt]));
    const todayKey = format(referenceDate, 'yyyy-MM-dd');
    const nextSevenDaysKey = format(addDays(referenceDate, 7), 'yyyy-MM-dd');
    // Single source of truth for "due today": the debt summary, which counts
    // outstanding, unapproved charges dated today (see calculateDebt glossary).
    const todayTenants = activeTenants.filter(tenant => debtByTenantId.get(tenant.id)?.hasUnapprovedDueToday);
    const rentedBikesCount = bikes.filter(bike => bike.status === 'in_rent').length;
    const maintBikesCount = bikes.filter(bike => bike.status === 'maintenance').length;
    const totalBikesCount = bikes.length;
    const activeWeeklyRevenue = rentingTenants.reduce((sum, tenant) => sum + getTenantWeeklyPayment(tenant), 0);

    return {
        activeWeeklyRevenue,
        // 52 weeks / 12 months.
        activeMonthlyRevenue: Math.round(activeWeeklyRevenue * (52 / 12)),
        totalBikesCount,
        rentedBikesCount,
        maintBikesCount,
        availBikesCount: bikes.filter(bike => bike.status === 'available').length,
        utilizationRate: rentedBikesCount / Math.max(totalBikesCount - maintBikesCount, 1),
        overdueCount: tenantDebt.filter(({ debt }) => debt.isOverdue).length,
        dueTodayCount: tenantDebt.reduce((count, { debt }) => count + debt.unapprovedDueTodayCount, 0),
        activeDebtorCount: tenantDebt.filter(({ debt }) => debt.totalDebt > 0).length,
        activeNonDebtorCount: tenantDebt.filter(({ debt }) => debt.totalDebt <= 0).length,
        todayDebtorCount: todayTenants.filter(tenant => (debtByTenantId.get(tenant.id)?.overdueAmount ?? 0) > 0).length,
        todayNonDebtorCount: todayTenants.filter(tenant => (debtByTenantId.get(tenant.id)?.overdueAmount ?? 0) <= 0).length,
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
            if (tenantFilter === 'today' && !debtSummary.hasUnapprovedDueToday) return false;
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
    referenceDate: Date = new Date(),
    metric: ChartMetric = 'payments',
): ChartPoint[] {
    if (metric === 'debt') return buildDebtChartData(tenants, chartPeriod, referenceDate);
    const grouped: Record<string, number> = {};
    const startDate = chartPeriod === 'week'
        ? subWeeks(referenceDate, 12)
        : chartPeriod === 'year'
            ? subYears(referenceDate, 5)
            : subMonths(referenceDate, 12);

    const entries = metric === 'payments'
        ? tenants.flatMap(tenant => (tenant.payments || []).map(payment => ({ date: payment.payment_date, amount: payment.amount })))
        : tenants.flatMap(tenant => (tenant.payment_charges || [])
            .filter(charge => charge.status !== 'waived')
            .map(charge => ({ date: charge.due_date, amount: charge.amount })));

    entries.forEach(entry => {
        const entryDate = parseISO(entry.date);
        if (!isAfter(entryDate, startDate)) return;
        const bucket = chartPeriod === 'week'
            ? startOfWeek(entryDate, { weekStartsOn: 1 })
            : chartPeriod === 'month' ? startOfMonth(entryDate) : startOfYear(entryDate);
        const key = format(bucket, 'yyyy-MM-dd');
        grouped[key] = (grouped[key] || 0) + (Number(entry.amount) || 0);
    });

    const currentWeekStart = startOfWeek(referenceDate, { weekStartsOn: 1 });
    const currentWeekKey = format(currentWeekStart, 'yyyy-MM-dd');
    const currentWeekDays = Math.min(7, Math.max(1, differenceInCalendarDays(referenceDate, currentWeekStart) + 1));

    return Object.keys(grouped).sort().filter(key => grouped[key] > 0).map(key => {
        const date = parseISO(key);
        const isCurrentWeekForecast = chartPeriod === 'week' && metric === 'payments' && key === currentWeekKey;
        const amount = isCurrentWeekForecast ? Math.round((grouped[key] / currentWeekDays) * 7) : Math.round(grouped[key]);
        if (chartPeriod === 'week') {
            const monthLabel = formatRussianDate(date, 'LLL');
            return {
                date: key,
                label: monthLabel.charAt(0).toUpperCase() + monthLabel.slice(1),
                fullLabel: `${formatRussianDate(date, 'd MMM')} - ${formatRussianDate(addDays(date, 6), 'd MMM')}${isCurrentWeekForecast ? ' · прогноз по темпу оплат' : ''}`,
                amount
            };
        }
        const label = chartPeriod === 'month' ? formatRussianDate(date, 'LLL') : format(date, 'yyyy');
        return { date: key, label, fullLabel: label, amount };
    });
}

function buildDebtChartData(tenants: Tenant[], chartPeriod: ChartPeriod, referenceDate: Date): ChartPoint[] {
    const count = chartPeriod === 'week' ? 12 : chartPeriod === 'month' ? 12 : 5;
    const start = chartPeriod === 'week' ? startOfWeek(subWeeks(referenceDate, count - 1), { weekStartsOn: 1 }) : chartPeriod === 'month' ? startOfMonth(subMonths(referenceDate, count - 1)) : startOfYear(subYears(referenceDate, count - 1));
    return Array.from({ length: count }, (_, index) => {
        const date = chartPeriod === 'week' ? addDays(start, index * 7) : chartPeriod === 'month' ? addMonths(start, index) : addYears(start, index);
        const value = tenants.reduce((sum, tenant) => sum + calculateDebt(tenant, tenant.payments || [], date).totalDebt, 0);
        const label = chartPeriod === 'week' ? formatRussianDate(date, 'd MMM') : chartPeriod === 'month' ? formatRussianDate(date, 'LLL') : format(date, 'yyyy');
        return { date: format(date, 'yyyy-MM-dd'), label, fullLabel: label, amount: Math.round(value) };
    });
}
