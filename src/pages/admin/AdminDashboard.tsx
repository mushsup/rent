import { lazy, Suspense, useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Plus, Search, ExternalLink, X } from 'lucide-react';
import { calculateDebt, getTenantWeeklyPayment } from '../../utils/calculateDebt';
import { DEFAULT_PAYMENT_DAY, PAYMENT_DAYS, getPaymentDay, getScheduledPaymentDate } from '../../utils/paymentSchedule';
import { format, startOfWeek, startOfMonth, startOfYear, parseISO, isAfter, subMonths, subYears, subWeeks, addDays } from 'date-fns';
import { ru } from 'date-fns/locale';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import type { Bike, Tenant } from '../../types';
import { createTenant, fetchBikes, fetchDashboardTenants } from '../../features/tenants/api';

const RevenueChart = lazy(() => import('./RevenueChart'));

export default function AdminDashboard() {
    const queryClient = useQueryClient();
    const navigate = useNavigate();
    const [search, setSearch] = useState('');
    const [chartPeriod, setChartPeriod] = useState('month'); // day, week, month, year
    const [statsTab, setStatsTab] = useState('percent'); // percent, amount

    // Archive visibility state
    const [showArchived, setShowArchived] = useState(false);
    const [tenantFilter, setTenantFilter] = useState('all');
    const [chartReady, setChartReady] = useState(false);

    useEffect(() => {
        const loadChart = () => setChartReady(true);
        if ('requestIdleCallback' in window) {
            const idleId = window.requestIdleCallback(loadChart, { timeout: 800 });
            return () => window.cancelIdleCallback(idleId);
        }
        const timeoutId = globalThis.setTimeout(loadChart, 250);
        return () => globalThis.clearTimeout(timeoutId);
    }, []);

    // Modals state
    const [isTenantModalOpen, setIsTenantModalOpen] = useState(false);

    const { data: bikes = [], isError: bikesError } = useQuery<Bike[]>({
        queryKey: ['bikes'],
        queryFn: fetchBikes
    });

    const { data: tenants = [], isLoading: loading, isError: tenantsError, error: tenantsQueryError } = useQuery<Tenant[]>({
        queryKey: ['tenants', 'dashboard', showArchived],
        queryFn: () => fetchDashboardTenants(showArchived)
    });

    const tenantSummaries = useMemo(() => tenants.map(tenant => ({
        ...tenant,
        debtSummary: calculateDebt(tenant, tenant.payments)
    })), [tenants]);

    const activeWeeklyRevenue = tenantSummaries.reduce((sum, t) => sum + (t.is_archived ? 0 : getTenantWeeklyPayment(t)), 0);
    const activeMonthlyRevenue = Math.round(activeWeeklyRevenue * 4.33);

    const totalBikesCount = bikes.length;
    const rentedBikesCount = bikes.filter(b => b.status === 'in_rent').length;
    const maintBikesCount = bikes.filter(b => b.status === 'maintenance').length;
    const availBikesCount = bikes.filter(b => b.status === 'available').length;
    const utilizationBase = Math.max(totalBikesCount - maintBikesCount, 1);
    const utilizationRate = rentedBikesCount / utilizationBase;
    
    const todayKey = format(new Date(), 'yyyy-MM-dd');
    const nextSevenDaysKey = format(addDays(new Date(), 7), 'yyyy-MM-dd');
    const activeTenants = tenantSummaries.filter(tenant => !tenant.is_archived);
    const tenantDebt = activeTenants.map(tenant => ({
        tenant,
        debt: tenant.debtSummary
    }));
    const overdueCount = tenantDebt.filter(({ debt }) => debt.isOverdue).length;
    const dueTodayCount = tenantDebt.filter(({ debt }) => debt.hasDueToday).length;
    const upcomingCount = tenantDebt.filter(({ tenant, debt }) => (
        tenant.bike_id
        && Number(tenant.weekly_payment) > 0
        && debt.nextPaymentDate
        && format(debt.nextPaymentDate, 'yyyy-MM-dd') >= todayKey
        && format(debt.nextPaymentDate, 'yyyy-MM-dd') <= nextSevenDaysKey
    )).length;
    const totalOutstandingDebt = tenantDebt.reduce((sum, { debt }) => sum + debt.totalDebt, 0);
    
    const processChartData = useCallback(() => {
        let grouped = {};
        const now = new Date();
        let startDate;

        switch (chartPeriod) {
            case 'week': startDate = subWeeks(now, 12); break;
            case 'month': startDate = subMonths(now, 12); break;
            case 'year': startDate = subYears(now, 5); break;
            default: startDate = subMonths(now, 12);
        }

        const allPayments = tenants.flatMap(t => t.payments || []);

        allPayments.forEach(p => {
            const pd = parseISO(p.payment_date);
            if (isAfter(pd, startDate)) {
                let key;
                if (chartPeriod === 'week') key = format(startOfWeek(pd, { weekStartsOn: 1 }), 'yyyy-MM-dd');
                else if (chartPeriod === 'month') key = format(startOfMonth(pd), 'yyyy-MM-dd');
                else if (chartPeriod === 'year') key = format(startOfYear(pd), 'yyyy-MM-dd');

                grouped[key] = (grouped[key] || 0) + (Number(p.amount) || 0);
            }
        });

        return Object.keys(grouped).sort().filter(key => grouped[key] > 0).map(key => {
            let label = key;
            let fullLabel = key;
            const d = parseISO(key);

            if (chartPeriod === 'week') {
                const monthLabel = format(d, 'LLL', { locale: ru });
                label = monthLabel.charAt(0).toUpperCase() + monthLabel.slice(1);
                const endOfWeek = addDays(d, 6);
                fullLabel = `${format(d, 'd MMM', { locale: ru })} - ${format(endOfWeek, 'd MMM', { locale: ru })}`;
            } else if (chartPeriod === 'month') {
                label = format(d, 'MMM yyyy', { locale: ru });
                fullLabel = label;
            } else if (chartPeriod === 'year') {
                label = format(d, 'yyyy');
                fullLabel = label;
            }

            return { date: key, label, fullLabel, amount: Math.round(grouped[key]) };
        });
    }, [tenants, chartPeriod]);

    const chartData = useMemo(() => tenants.length > 0 ? processChartData() : [], [tenants.length, processChartData]);

    const filteredTenants = tenantSummaries.filter(t => {
        // filter by search
        const matchesSearch = t.name.toLowerCase().includes(search.toLowerCase()) ||
            (t.bikes?.model || '').toLowerCase().includes(search.toLowerCase());
        if (!matchesSearch) return false;

        // filter by archived
        if (showArchived ? !t.is_archived : t.is_archived) return false;

        const nextDateKey = t.debtSummary.nextPaymentDate
            ? format(t.debtSummary.nextPaymentDate, 'yyyy-MM-dd')
            : null;
        if (tenantFilter === 'overdue' && !t.debtSummary.isOverdue) return false;
        if (tenantFilter === 'today' && !t.debtSummary.hasDueToday) return false;
        if (tenantFilter === 'upcoming' && !(
            t.bike_id
            && Number(t.weekly_payment) > 0
            && nextDateKey
            && nextDateKey >= todayKey
            && nextDateKey <= nextSevenDaysKey
        )) return false;
        if (tenantFilter === 'debt' && t.debtSummary.totalDebt <= 0) return false;

        return true;
    }).sort((a, b) => {
        // sort by nextPaymentDate closest first
        const debtA = a.debtSummary;
        const debtB = b.debtSummary;
        const timeA = debtA.oldestUnpaidDate?.getTime() ?? debtA.nextPaymentDate?.getTime() ?? Infinity;
        const timeB = debtB.oldestUnpaidDate?.getTime() ?? debtB.nextPaymentDate?.getTime() ?? Infinity;
        return timeA - timeB;
    });

    const handleRowClick = (tenant) => {
        navigate(`/admin/tenant/${tenant.id}`);
    };

    return (
        <div className="pt-2">
            {(tenantsError || bikesError) && (
                <div className="mb-4 rounded-lg border border-red-300/50 bg-red-50/50 px-4 py-3 text-sm text-red-600 dark:border-red-800/50 dark:bg-red-900/20 dark:text-red-300">
                    Не удалось загрузить часть данных. {tenantsQueryError?.message || 'Проверьте подключение к базе данных.'}
                </div>
            )}
            {/* Dashboard Cards */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-stretch">
                {/* Chart Card */}
                <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-5 shadow-sm lg:col-span-2 flex flex-col h-full min-h-[240px]">
                    <div className="flex justify-end items-center mb-4">
                        <div className="flex bg-gray-100 dark:bg-gray-900 rounded-lg p-1 border border-gray-200 dark:border-gray-700">
                            {['week', 'month', 'year'].map((period) => (
                                <button
                                    key={period}
                                    onClick={() => setChartPeriod(period)}
                                    className={`px-3 py-1 text-xs font-medium rounded-md transition-colors ${chartPeriod === period ? 'bg-indigo-600 text-white shadow-sm' : 'text-gray-500 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white hover:bg-white dark:hover:bg-gray-800'}`}
                                >
                                    {period === 'week' ? 'Нед' : period === 'month' ? 'Мес' : 'Год'}
                                </button>
                            ))}
                        </div>
                    </div>
                    <div className="w-full mt-2 flex-1 focus:outline-none" style={{ outline: 'none' }}>
                        <Suspense fallback={<div className="h-full min-h-[170px] animate-pulse rounded-lg bg-gray-100 dark:bg-gray-900/60" />}>
                            {chartReady ? <RevenueChart data={chartData} /> : <div className="h-full min-h-[170px] rounded-lg bg-gray-100 dark:bg-gray-900/60" />}
                        </Suspense>
                    </div>
                </div>

                {/* Occupancy/Revenue Card */}
                <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 transition-all shadow-sm flex flex-col h-full relative overflow-hidden min-h-[240px]">
                    {/* Top Controls: Tabs */}
                    <div className="absolute top-4 right-4 z-10 flex bg-gray-100 dark:bg-gray-900 rounded-lg p-1 border border-gray-200 dark:border-gray-700">
                        <button
                            onClick={() => setStatsTab('percent')}
                            className={`px-3 py-1 text-xs font-medium rounded-md transition-colors ${statsTab === 'percent' ? 'bg-indigo-600 text-white shadow-sm' : 'text-gray-500 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white hover:bg-white dark:hover:bg-gray-800'}`}
                        >
                            %
                        </button>
                        <button
                            onClick={() => setStatsTab('amount')}
                            className={`px-3 py-1 text-xs font-medium rounded-md transition-colors ${statsTab === 'amount' ? 'bg-indigo-600 text-white shadow-sm' : 'text-gray-500 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white hover:bg-white dark:hover:bg-gray-800'}`}
                        >
                            zł
                        </button>
                    </div>

                    {/* Central Content: Centered relative to entire card height */}
                    <div className="flex-1 flex flex-col items-center justify-center p-3 min-h-0">
                        <div className="flex flex-col items-center">
                            <div className="text-4xl sm:text-5xl font-bold text-gray-900 dark:text-white flex items-baseline justify-center gap-2 transition-all">
                                {statsTab === 'percent' ? (
                                    <>
                                        <span>{Math.round(utilizationRate * 100)}</span>
                                        <span className="text-2xl sm:text-3xl text-gray-400 dark:text-gray-500 font-medium whitespace-nowrap">/ 100%</span>
                                    </>
                                ) : (
                                    <>
                                        <span>{activeMonthlyRevenue.toLocaleString('ru-RU')}</span>
                                        <span className="text-2xl sm:text-3xl text-gray-400 dark:text-gray-500 font-medium whitespace-nowrap">zł/мес</span>
                                    </>
                                )}
                            </div>

                            {/* Motivational Badge */}
                            <div className="mt-2">
                                <span className={`inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-extrabold uppercase border shadow-sm transition-all whitespace-nowrap ${
                                    utilizationRate < 0.40 ? 'bg-gray-100 dark:bg-gray-700 text-gray-900 dark:text-gray-200 border-gray-200 dark:border-gray-600' : 
                                    utilizationRate < 0.60 ? 'bg-red-100/30 dark:bg-red-900/20 text-red-600 dark:text-red-400 border-red-200/30 dark:border-red-800/30' : 
                                    utilizationRate < 0.80 ? 'bg-orange-100/30 dark:bg-orange-900/20 text-orange-600 dark:text-orange-400 border-orange-200/30 dark:border-orange-800/30' : 
                                    utilizationRate < 0.95 ? 'bg-yellow-100/30 dark:bg-yellow-900/20 text-yellow-600 dark:text-yellow-400 border-yellow-200/30 dark:border-yellow-800/30' : 
                                    'bg-green-100/30 dark:bg-green-900/20 text-green-600 dark:text-green-400 border-green-200/30 dark:border-green-800/30'
                                }`}>
                                    {utilizationRate < 0.40 ? (
                                        <><span>💀</span> Смерть в нищете</>
                                    ) : utilizationRate < 0.60 ? (
                                        <><span>🫠</span> Касса в тильте</>
                                    ) : utilizationRate < 0.80 ? (
                                        <><span>🗿</span> На морально-волевых</>
                                    ) : utilizationRate < 0.95 ? (
                                        <><span>🦍</span> Мощь</>
                                    ) : (
                                        <><span>🕯️</span> Свободных тел нет</>
                                    )}
                                </span>
                            </div>
                        </div>
                    </div>
                    
                    {/* Bottom Section: Numbers + Progress Bar */}
                    <div className="absolute bottom-0 left-0 w-full flex flex-col">
                        {/* Numbers */}
                        <div className="flex w-full mb-1 text-[11px] font-medium text-gray-400 dark:text-gray-500 px-0.5">
                            {rentedBikesCount > 0 && (
                                <div style={{ width: `${(rentedBikesCount / totalBikesCount) * 100}%` }} className="flex justify-center transition-all">
                                    {rentedBikesCount}
                                </div>
                            )}
                            {maintBikesCount > 0 && (
                                <div style={{ width: `${(maintBikesCount / totalBikesCount) * 100}%` }} className="flex justify-center transition-all">
                                    {maintBikesCount}
                                </div>
                            )}
                            {availBikesCount > 0 && (
                                <div style={{ width: `${(availBikesCount / totalBikesCount) * 100}%` }} className="flex justify-center transition-all">
                                    {availBikesCount}
                                </div>
                            )}
                        </div>
                        {/* Progress Bar */}
                        <div className="flex w-full h-3 transition-all">
                            {rentedBikesCount > 0 && (
                                <div style={{ width: `${(rentedBikesCount / totalBikesCount) * 100}%` }} className="bg-green-500 transition-all"></div>
                            )}
                            {maintBikesCount > 0 && (
                                <div style={{ width: `${(maintBikesCount / totalBikesCount) * 100}%` }} className="bg-orange-500 transition-all"></div>
                            )}
                            {availBikesCount > 0 && (
                                <div style={{ width: `${(availBikesCount / totalBikesCount) * 100}%` }} className="bg-white transition-all"></div>
                            )}
                        </div>
                    </div>
                </div>
            </div>

            <div className="mt-6">
                <div className="flex flex-row gap-3 items-stretch">
                    <div className="relative flex-1 max-w-lg">
                        <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3">
                            <Search className="h-5 w-5 text-gray-400 dark:text-gray-500" />
                        </div>
                        <input
                            type="text"
                            className="block w-full h-full rounded-md border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-white pl-10 py-2 border sm:text-sm focus:border-indigo-500 focus:ring-indigo-500 placeholder-gray-500"
                            placeholder="Поиск"
                            value={search}
                            onChange={(e) => setSearch(e.target.value)}
                        />
                    </div>

                    <div className="relative flex-none">
                        <button
                            type="button"
                            role="switch"
                            aria-checked={showArchived}
                            onClick={() => setShowArchived((current) => !current)}
                            aria-label="Показывать архивных"
                            className={`flex items-center justify-center gap-2 h-full px-3 sm:px-4 py-2 border rounded-md text-sm font-medium transition-colors ${showArchived ? 'bg-indigo-50 dark:bg-indigo-900/30 border-indigo-200 dark:border-indigo-500 text-indigo-700 dark:text-indigo-400' : 'bg-transparent border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-300 hover:bg-transparent hover:border-gray-400 dark:hover:border-gray-500'}`}
                        >
                            <span className={`relative inline-flex h-5 w-9 flex-shrink-0 rounded-full transition-colors ${showArchived ? 'bg-indigo-600' : 'bg-gray-300 dark:bg-gray-600'}`} aria-hidden="true">
                                <span className={`inline-block h-4 w-4 translate-y-0.5 rounded-full bg-white shadow transition-transform ${showArchived ? 'translate-x-4' : 'translate-x-0.5'}`} />
                            </span>
                            <span>Архивные</span>
                        </button>
                    </div>

                    <button
                        onClick={() => setIsTenantModalOpen(true)}
                        className="flex-none inline-flex items-center justify-center rounded-md border border-transparent bg-indigo-600 px-3 sm:px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-indigo-700 transition-colors focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 focus:ring-offset-gray-900"
                    >
                        <Plus className="h-5 w-5 sm:mr-1.5" />
                        <span className="hidden sm:inline">Добавить</span>
                    </button>
                </div>
            </div>

            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mt-6">
                {[
                    { id: 'overdue', label: 'Просрочено', value: overdueCount, color: 'text-red-500', suffix: '' },
                    { id: 'today', label: 'Платежи сегодня', value: dueTodayCount, color: 'text-orange-500', suffix: '' },
                    { id: 'upcoming', label: 'Ближайшие 7 дней', value: upcomingCount, color: 'text-indigo-500', suffix: '' },
                    { id: 'debt', label: 'Долги всего', value: totalOutstandingDebt.toLocaleString('ru-RU'), color: 'text-red-500', suffix: ' zł' }
                ].map(card => (
                    <button
                        key={card.id}
                        type="button"
                        onClick={() => setTenantFilter(current => current === card.id ? 'all' : card.id)}
                        className={`rounded-xl border p-3 text-left transition-colors ${tenantFilter === card.id ? 'border-indigo-500 bg-indigo-50 dark:bg-indigo-900/20' : 'border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 hover:border-gray-400 dark:hover:border-gray-500'}`}
                    >
                        <div className="text-[11px] font-medium text-gray-500 dark:text-gray-400 leading-tight">{card.label}</div>
                        <div className={`mt-1 text-xl font-bold ${card.color}`}>{card.value}{card.suffix}</div>
                    </button>
                ))}
            </div>

            {/* Mobile View (Cards) */}
            <div className="mt-6 sm:hidden space-y-2">
                {filteredTenants.map((tenant) => {
                    const { totalDebt, nextPaymentDate } = tenant.debtSummary;
                    return (
                        <div
                            key={tenant.id}
                            onClick={() => handleRowClick(tenant)}
                            className="rounded-lg p-3 border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 shadow-sm cursor-pointer flex items-center justify-between gap-4"
                        >
                            <div className="min-w-0 flex-1">
                                <div className="font-bold text-gray-900 dark:text-white truncate flex items-center gap-2">
                                    {tenant.name}
                                    {tenant.is_archived && <span className="bg-gray-100 dark:bg-gray-700 text-gray-500 px-1.5 py-0.5 rounded text-[9px] uppercase font-bold tracking-wider">А</span>}
                                </div>
                                <div className="text-xs text-gray-500 dark:text-gray-400 truncate">{tenant.bikes?.model || 'Нет велосипеда'}</div>
                            </div>
                            
                            <div className="flex flex-col items-end justify-center py-1">
                                <div className="flex items-center gap-3">
                                    <div className="text-xs text-gray-400 dark:text-gray-500 font-medium tracking-tight">
                                        {nextPaymentDate ? format(nextPaymentDate, 'dd.MM') : '—'}
                                    </div>
                                    {totalDebt > 0 && (
                                        <span className="inline-flex items-center px-2 py-1.5 rounded-md text-xs font-bold bg-red-100/30 text-red-600 dark:bg-red-900/20 dark:text-red-500 uppercase border border-red-200/30 dark:border-red-800/30 leading-none">
                                            Долг {totalDebt} zł
                                        </span>
                                    )}
                                </div>
                            </div>
                            
                        </div>
                    );
                })}
                {!loading && filteredTenants.length === 0 && (
                    <div className="py-8 text-center text-gray-400 dark:text-gray-500">Нет данных для отображения.</div>
                )}
            </div>

            {/* Desktop View (Table) */}
            <div className="mt-8 hidden sm:flex flex-col">
                <div className="-my-2 -mx-4 overflow-x-auto sm:-mx-6 lg:-mx-8 pb-32">
                    <div className="inline-block min-w-full py-2 align-middle md:px-6 lg:px-8">
                        <div className="overflow-hidden shadow ring-1 ring-gray-200 dark:ring-black ring-opacity-5 rounded-lg border border-gray-200 dark:border-gray-700">
                            <table className="min-w-full divide-y divide-gray-100 dark:divide-gray-700">
                                <thead className="bg-white dark:bg-gray-800">
                                    <tr>
                                        <th className="py-3 pl-4 pr-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider sm:pl-6">Имя</th>
                                        <th className="px-3 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Велосипед</th>
                                        <th className="px-3 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Баланс</th>
                                        <th className="px-3 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Статус</th>
                                        <th className="px-3 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">След. платеж</th>
                                        <th className="relative py-3 pl-3 pr-4 sm:pr-6"><span className="sr-only">Действия</span></th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-gray-100 dark:divide-gray-700 bg-transparent">
                                    {filteredTenants.map((tenant) => {
                                        const { totalDebt, nextPaymentDate } = tenant.debtSummary;
                                        return (
                                            <tr key={tenant.id} onClick={() => handleRowClick(tenant)} className="cursor-pointer group transition-colors hover:bg-black/5 dark:hover:bg-white/10">
                                                <td className="whitespace-nowrap py-4 pl-4 pr-3 text-sm sm:pl-6">
                                                    <div className="flex items-center">
                                                        <div className="ml-0">
                                                            <div className={`font-medium flex items-center gap-2 ${tenant.is_archived ? 'text-gray-400 dark:text-gray-500' : 'text-black dark:text-white'}`}>
                                                                {tenant.name}
                                                                {tenant.is_archived && <span className="bg-gray-100 dark:bg-gray-700 text-gray-500 dark:text-gray-300 px-2 py-0.5 rounded text-[10px] uppercase font-bold tracking-wider">Архив</span>}
                                                            </div>
                                                            <div onClick={e => e.stopPropagation()}>
                                                                <Link to={`/${tenant.slug}`} target="_blank" className="text-xs text-gray-400 dark:text-gray-500 hover:text-indigo-400 flex items-center mt-0.5">
                                                                    /{tenant.slug} <ExternalLink className="w-3 h-3 ml-1" />
                                                                </Link>
                                                            </div>
                                                        </div>
                                                    </div>
                                                </td>
                                                <td className="whitespace-nowrap px-3 py-4 text-sm text-black dark:text-gray-300">
                                                    {tenant.bikes?.model || '—'}
                                                </td>
                                                <td className="whitespace-nowrap px-3 py-4 text-sm text-red-500 dark:text-red-400 font-medium">
                                                    {totalDebt > 0 ? `Долг ${totalDebt}\u00A0zł` : ''}
                                                </td>
                                                <td className="whitespace-nowrap px-3 py-4 text-sm">
                                                    {totalDebt > 0 ? (
                                                        <span className="inline-flex rounded-md bg-red-100/30 dark:bg-red-900/20 px-2.5 py-1 text-[11px] font-bold text-red-600 dark:text-red-400 uppercase tracking-wide border border-red-200/30 dark:border-red-800/30">
                                                            Не оплачено
                                                        </span>
                                                    ) : (
                                                        <span className="inline-flex rounded-md bg-green-100/30 dark:bg-green-900/20 px-2.5 py-1 text-[11px] font-bold text-green-600 dark:text-green-400 uppercase tracking-wide border border-green-200/30 dark:border-green-800/30">
                                                            Оплачено
                                                        </span>
                                                    )}
                                                </td>
                                                <td className="whitespace-nowrap px-3 py-4 text-sm text-black dark:text-gray-400">
                                                    {nextPaymentDate && format(nextPaymentDate, 'dd.MM.yyyy')}
                                                </td>
                                                <td className="relative whitespace-nowrap py-4 pl-3 pr-4 text-right text-sm font-medium sm:pr-6">
                                                    <div className="flex justify-end gap-2 relative">
                                                    </div>
                                                </td>
                                            </tr>
                                        );
                                    })}
                                    {!loading && filteredTenants.length === 0 && (
                                        <tr><td colSpan={6} className="py-8 text-center text-gray-400 dark:text-gray-500">Нет данных для отображения.</td></tr>
                                    )}
                                    {loading && (
                                        <tr><td colSpan={6} className="py-8 text-center text-gray-400 dark:text-gray-500">Загрузка...</td></tr>
                                    )}
                                </tbody>
                            </table>
                        </div>
                    </div>
                </div>
            </div>

            {isTenantModalOpen && (
                <div className="fixed inset-0 z-50">
                    <div className="fixed inset-0 bg-gray-900/80 backdrop-blur-sm transition-opacity" onClick={(e) => { e.stopPropagation(); setIsTenantModalOpen(false); }} />
                    <div className="fixed inset-0 z-10 flex items-center justify-center p-4 pointer-events-none">
                        <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl max-w-md w-full p-6 shadow-2xl relative pointer-events-auto mt-8 max-h-[90vh] overflow-y-auto">
                            <TenantModal
                                bikes={bikes}
                                onClose={() => setIsTenantModalOpen(false)}
                                onSuccess={() => { setIsTenantModalOpen(false); queryClient.invalidateQueries({ queryKey: ['tenants'] }); queryClient.invalidateQueries({ queryKey: ['bikes'] }); }}
                            />
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}

function TenantModal({ onClose, onSuccess, bikes }) {
    const [formData, setFormData] = useState({
        name: '', slug: '', bike_id: '', weekly_payment: '', payment_day: DEFAULT_PAYMENT_DAY,
        next_payment_date: getScheduledPaymentDate(new Date(), DEFAULT_PAYMENT_DAY), deposit: '', phone: '', telegram_username: ''
    });
    const [loading, setLoading] = useState(false);

    const sortedBikes = bikes
        .filter(b => b.status === 'available')
        .sort((a, b) => a.model.localeCompare(b.model));

    const handleBikeChange = (e) => setFormData(prev => ({ ...prev, bike_id: e.target.value }));

    const handlePaymentDayChange = (e) => {
        const paymentDay = Number(e.target.value);
        setFormData(prev => ({
            ...prev,
            payment_day: paymentDay,
            next_payment_date: getScheduledPaymentDate(prev.next_payment_date || new Date(), paymentDay)
        }));
    };

    const handleFirstPaymentDateChange = (e) => {
        const nextPaymentDate = e.target.value;
        setFormData(prev => ({
            ...prev,
            next_payment_date: nextPaymentDate,
            payment_day: nextPaymentDate ? getPaymentDay(nextPaymentDate) : prev.payment_day
        }));
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        setLoading(true);
        const rentAmount = Number(formData.weekly_payment) || 0;
        const firstPaymentDate = formData.next_payment_date;

        try {
            await createTenant({ ...formData, weekly_payment: rentAmount, next_payment_date: firstPaymentDate });
            onSuccess();
        } catch (error) {
            alert(error.message);
        }
        setLoading(false);
    };

    return (
        <div>
            <div className="flex justify-between items-center mb-4">
                <h3 className="text-lg font-medium leading-6 text-gray-900 dark:text-white">Новый арендатор</h3>
                <button onClick={onClose} className="text-gray-500 dark:text-gray-400 hover:text-gray-900 dark:text-white transition-colors bg-gray-200/50 dark:bg-gray-700/50 hover:bg-gray-200 dark:bg-gray-700 p-1 rounded-md">
                    <X className="w-5 h-5" />
                </button>
            </div>
            <form onSubmit={handleSubmit} className="space-y-4">
                <div>
                    <label className="block text-sm font-medium text-gray-600 dark:text-gray-300">Имя арендатора</label>
                    <input type="text" required value={formData.name} onChange={e => setFormData({ ...formData, name: e.target.value })} className="mt-1 block w-full rounded-md bg-white dark:bg-gray-700 border border-gray-200 dark:border-gray-600 text-gray-900 dark:text-white py-2 px-3 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 sm:text-sm" />
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                        <label className="block text-sm font-medium text-gray-600 dark:text-gray-300">Псевдоним ссылки</label>
                        <div className="mt-1 flex rounded-md">
                            <span className="inline-flex items-center rounded-l-md border border-r-0 border-gray-200 dark:border-gray-600 bg-gray-50 dark:bg-gray-700 px-3 text-gray-500 dark:text-gray-400 sm:text-sm">/</span>
                            <input type="text" required value={formData.slug} onChange={e => setFormData({ ...formData, slug: e.target.value })} className="block w-full min-w-0 flex-1 rounded-none rounded-r-md bg-white dark:bg-gray-700 border border-gray-200 dark:border-gray-600 text-gray-900 dark:text-white py-2 px-3 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 sm:text-sm" placeholder="ivan-123" />
                        </div>
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-gray-600 dark:text-gray-300">Велосипед</label>
                        <select
                            value={formData.bike_id}
                            onChange={handleBikeChange}
                            className="mt-1 block w-full rounded-md bg-white dark:bg-gray-700 border border-gray-200 dark:border-gray-600 text-gray-900 dark:text-white py-2 px-3 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 sm:text-sm"
                        >
                            <option value="">Нет велосипеда</option>
                            {sortedBikes.map(b => (
                                <option key={b.id} value={b.id}>
                                    {b.status === 'available' ? '🟢✅ ' : '🟠🔧 '}{b.model}
                                </option>
                            ))}
                        </select>
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-gray-600 dark:text-gray-300">Дата первого платежа</label>
                        <input type="date" required value={formData.next_payment_date} onChange={handleFirstPaymentDateChange} className="mt-1 block w-full rounded-md bg-white dark:bg-gray-700 border border-gray-200 dark:border-gray-600 text-gray-900 dark:text-white py-2 px-3 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 sm:text-sm" style={{ colorScheme: 'dark' }} />
                        <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">Это ожидаемое начисление, а не уже полученная оплата.</p>
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-gray-600 dark:text-gray-300">День еженедельного платежа</label>
                        <select value={formData.payment_day} onChange={handlePaymentDayChange} className="mt-1 block w-full rounded-md bg-white dark:bg-gray-700 border border-gray-200 dark:border-gray-600 text-gray-900 dark:text-white py-2 px-3 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 sm:text-sm">
                            {PAYMENT_DAYS.map(day => <option key={day.value} value={day.value}>{day.label}</option>)}
                        </select>
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-gray-600 dark:text-gray-300">Телефон</label>
                        <input type="tel" value={formData.phone} onChange={e => setFormData({ ...formData, phone: e.target.value })} placeholder="+48 123 456 789" className="mt-1 block w-full rounded-md bg-white dark:bg-gray-700 border border-gray-200 dark:border-gray-600 text-gray-900 dark:text-white py-2 px-3 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 sm:text-sm" />
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-gray-600 dark:text-gray-300">Telegram</label>
                        <input type="text" value={formData.telegram_username} onChange={e => setFormData({ ...formData, telegram_username: e.target.value })} placeholder="username или @username" className="mt-1 block w-full rounded-md bg-white dark:bg-gray-700 border border-gray-200 dark:border-gray-600 text-gray-900 dark:text-white py-2 px-3 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 sm:text-sm" />
                    </div>
                </div>
                <div>
                    <label className="block text-sm font-medium text-gray-600 dark:text-gray-300">Еженедельный платеж (zł)</label>
                    <input type="number" min="0" required value={formData.weekly_payment} onChange={e => setFormData({ ...formData, weekly_payment: e.target.value })} className="mt-1 block w-full rounded-md bg-white dark:bg-gray-700 border border-gray-200 dark:border-gray-600 text-gray-900 dark:text-white py-2 px-3 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 sm:text-sm" placeholder="150" />
                </div>
                <div>
                    <label className="block text-sm font-medium text-gray-600 dark:text-gray-300">Депозит (zł)</label>
                    <input type="number" required value={formData.deposit} onChange={e => setFormData({ ...formData, deposit: e.target.value })} className="mt-1 block w-full rounded-md bg-white dark:bg-gray-700 border border-gray-200 dark:border-gray-600 text-gray-900 dark:text-white py-2 px-3 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 sm:text-sm" placeholder="Стоимость залога" />
                </div>


                <div className="mt-5 sm:mt-6 sm:grid sm:grid-flow-row-dense sm:grid-cols-2 sm:gap-3">
                    <button type="submit" disabled={loading} className="inline-flex w-full justify-center rounded-md border border-transparent bg-indigo-600 px-4 py-2 text-base font-medium text-white shadow-sm hover:bg-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 focus:ring-offset-gray-900 sm:col-start-2 sm:text-sm disabled:opacity-50">
                        Создать
                    </button>
                    <button type="button" onClick={onClose} className="mt-3 inline-flex w-full justify-center rounded-md bg-gray-200 dark:bg-gray-700 px-4 py-2 text-base font-medium text-gray-800 dark:text-gray-200 hover:bg-gray-300 dark:hover:bg-gray-600 sm:col-start-1 sm:mt-0 sm:text-sm transition-colors">
                        Отмена
                    </button>
                </div>
            </form>
        </div>
    );
}
