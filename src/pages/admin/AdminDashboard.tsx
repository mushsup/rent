import { lazy, Suspense, useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Plus, Search, ExternalLink } from 'lucide-react';
import { formatRussianShortDate } from '../../utils/russianDate';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import type { Bike, Tenant } from '../../types';
import { fetchDashboardSnapshot, fetchRentalBikeOptions } from '../../features/tenants/api';
import { queryKeys } from '../../shared/lib/queryKeys';
import { formatZl } from '../../shared/lib/money';
import { TenantCreateModal } from './TenantCreateModal';
import { Button, Dialog, EmptyState, ErrorState, LoadingState, StatusBadge } from '../../shared/ui';
import {
    buildRevenueChartData,
    buildTenantSummaries,
    filterDashboardTenants,
    getDashboardStats,
    type ChartMetric, type ChartPeriod,
    type TenantFilter
} from './dashboardSelectors';

const RevenueChart = lazy(() => import('./RevenueChart'));
export default function AdminDashboard() {
    const queryClient = useQueryClient();
    const navigate = useNavigate();
    const [search, setSearch] = useState('');
    const [chartPeriod, setChartPeriod] = useState<ChartPeriod>('month');
    const [chartMetrics, setChartMetrics] = useState<Record<ChartMetric, boolean>>({ payments: true, charges: false, debt: false });
    const [statsTab, setStatsTab] = useState('percent'); // percent, amount

    // Archive visibility state
    const [showArchived, setShowArchived] = useState(false);
    const [tenantFilter, setTenantFilter] = useState<TenantFilter>('all');
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
    const rentalBikesQuery = useQuery<Bike[]>({
        queryKey: queryKeys.bikes.rentalOptions,
        queryFn: fetchRentalBikeOptions,
        enabled: isTenantModalOpen,
    });

    const { data: snapshot, isLoading: loading, isError: tenantsError, error: tenantsQueryError } = useQuery({
        queryKey: queryKeys.tenants.dashboard(showArchived),
        queryFn: () => fetchDashboardSnapshot(showArchived)
    });
    const tenants = useMemo(() => snapshot?.tenants || [], [snapshot]);
    const bikes = useMemo(() => snapshot?.bikes || [] as Pick<Bike, 'id' | 'status'>[], [snapshot]);

    const referenceDate = useMemo(() => new Date(), []);
    const tenantSummaries = useMemo(() => buildTenantSummaries(tenants, referenceDate), [tenants, referenceDate]);
    const stats = useMemo(() => getDashboardStats(tenantSummaries, bikes, referenceDate), [tenantSummaries, bikes, referenceDate]);
    const chartSeries = useMemo(() => ([
        { key: 'payments', label: 'Оплаты', color: 'var(--or-primary)', forecastLast: chartPeriod === 'week', data: buildRevenueChartData(tenants, chartPeriod, referenceDate, 'payments') },
        { key: 'charges', label: 'Начисления', color: '#a28a62', data: buildRevenueChartData(tenants, chartPeriod, referenceDate, 'charges') },
        { key: 'debt', label: 'Общий долг', color: '#f87171', data: buildRevenueChartData(tenants, chartPeriod, referenceDate, 'debt') },
    ].filter(item => chartMetrics[item.key as ChartMetric])), [tenants, chartPeriod, referenceDate, chartMetrics]);
    const filteredTenants = useMemo(() => filterDashboardTenants(tenantSummaries, {
        search,
        showArchived,
        tenantFilter,
        referenceDate
    }), [tenantSummaries, search, showArchived, tenantFilter, referenceDate]);

    const {
        activeMonthlyRevenue,
        totalBikesCount,
        rentedBikesCount,
        maintBikesCount,
        availBikesCount,
        utilizationRate,
        dueTodayCount,
        activeDebtorCount,
        activeNonDebtorCount,
        totalOutstandingDebt
    } = stats;
    const totalActive = activeDebtorCount + activeNonDebtorCount;
    const debtSlots = totalActive ? Math.round((activeDebtorCount / totalActive) * 10) : 0;
    const animatedUtilizationRate = useAnimatedNumber(utilizationRate, 2000);
    const totalBikeCount = Math.max(totalBikesCount, 1);
    let occupancyElapsed = 0;
    const occupancySegments = [
        { ratio: rentedBikesCount / totalBikeCount, className: 'bg-lime-500' },
        { ratio: maintBikesCount / totalBikeCount, className: 'bg-orange-500' },
        { ratio: availBikesCount / totalBikeCount, className: 'bg-slate-300 dark:bg-slate-700' },
    ].filter(segment => segment.ratio > 0).map(segment => {
        const duration = segment.ratio * 2000;
        const result = { ...segment, duration, delay: occupancyElapsed };
        occupancyElapsed += duration;
        return result;
    });

    const handleRowClick = (tenant: Tenant) => {
        if (tenant.id) navigate(`/tenant/${tenant.id}`);
    };

    return (
        <div className="pt-2">
            {tenantsError && (
                <div className="mb-4"><ErrorState message={`Не удалось загрузить часть данных. ${tenantsQueryError?.message || 'Проверьте подключение к базе данных.'}`} retry={() => { void queryClient.invalidateQueries({ queryKey: queryKeys.tenants.dashboards }); }} /></div>
            )}
            {/* Dashboard Cards */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-stretch">
                {/* Chart Card */}
                <div className="h-[280px] bg-white dark:bg-slate-900 rounded-lg border border-slate-200 dark:border-slate-800 p-5 shadow-sm lg:col-span-2 flex flex-col">
                    <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
                        <div className="flex rounded-lg border border-slate-200 bg-slate-100 p-1 dark:border-slate-800 dark:bg-slate-900">
                            {([['payments', 'Оплаты'], ['charges', 'Начисления'], ['debt', 'Общий долг']] as const).map(([metric, label]) => <button key={metric} type="button" aria-pressed={chartMetrics[metric]} onClick={() => setChartMetrics(current => ({ ...current, [metric]: !current[metric] }))} className={`rounded-md px-2.5 py-1 text-xs font-medium transition-colors ${chartMetrics[metric] ? 'bg-white text-slate-950 shadow-sm dark:bg-slate-700 dark:text-white' : 'text-slate-500 dark:text-slate-400'}`}>{label}</button>)}
                        </div>
                        <div className="flex bg-slate-100 dark:bg-slate-900 rounded-lg p-1 border border-slate-200 dark:border-slate-800">
                            {(['week', 'month', 'year'] as const).map((period) => (
                                <button
                                    key={period}
                                    type="button"
                                    aria-pressed={chartPeriod === period}
                                    onClick={() => setChartPeriod(period)}
                                    className={`px-3 py-1 text-xs font-medium rounded-md transition-colors ${chartPeriod === period ? 'bg-white text-slate-950 shadow-sm dark:bg-slate-700 dark:text-white' : 'text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white hover:bg-white dark:hover:bg-slate-800'}`}
                                >
                                    {period === 'week' ? 'Нед' : period === 'month' ? 'Мес' : 'Год'}
                                </button>
                            ))}
                        </div>
                    </div>
                    <div className="w-full mt-2 flex-1 focus:outline-none" style={{ outline: 'none' }}>
                        <Suspense fallback={<div className="h-full min-h-[170px] animate-pulse rounded-lg bg-slate-100 dark:bg-slate-900/60" />}>
                            {chartReady && chartSeries.length ? <RevenueChart series={chartSeries} /> : <div className="h-full min-h-[170px] rounded-lg bg-slate-100 dark:bg-slate-900/60" />}
                        </Suspense>
                    </div>
                </div>

                {/* Occupancy/Revenue Card */}
                <div className="h-[280px] bg-white dark:bg-slate-900 rounded-lg border border-slate-200 dark:border-slate-800 transition-all shadow-sm flex flex-col relative overflow-hidden">
                    {/* Top Controls: Tabs */}
                    <div className="absolute top-4 right-4 z-10 flex bg-slate-100 dark:bg-slate-900 rounded-lg p-1 border border-slate-200 dark:border-slate-800">
                        <button
                            type="button"
                            aria-pressed={statsTab === 'percent'}
                            onClick={() => setStatsTab('percent')}
                            className={`px-3 py-1 text-xs font-medium rounded-md transition-colors ${statsTab === 'percent' ? 'bg-lime-600 text-slate-950 shadow-sm' : 'text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white hover:bg-white dark:hover:bg-slate-800'}`}
                        >
                            %
                        </button>
                        <button
                            type="button"
                            aria-pressed={statsTab === 'amount'}
                            onClick={() => setStatsTab('amount')}
                            className={`px-3 py-1 text-xs font-medium rounded-md transition-colors ${statsTab === 'amount' ? 'bg-lime-600 text-slate-950 shadow-sm' : 'text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white hover:bg-white dark:hover:bg-slate-800'}`}
                        >
                            zł
                        </button>
                    </div>

                    {/* Central Content: Centered relative to entire card height */}
                    <div className="flex-1 flex flex-col items-center justify-center p-3 min-h-0">
                        <div className="flex flex-col items-center">
                            <div className="text-4xl sm:text-5xl font-bold text-slate-900 dark:text-white flex items-baseline justify-center gap-2 transition-all">
                                {statsTab === 'percent' ? (
                                    <>
                                        <span>{Math.round(animatedUtilizationRate * 100)}</span>
                                        <span className="text-2xl sm:text-3xl text-slate-500 dark:text-slate-400 font-medium whitespace-nowrap">/ 100%</span>
                                    </>
                                ) : (
                                    <>
                                        <span>{activeMonthlyRevenue.toLocaleString('ru-RU')}</span>
                                        <span className="text-2xl sm:text-3xl text-slate-500 dark:text-slate-400 font-medium whitespace-nowrap">zł/мес</span>
                                    </>
                                )}
                            </div>

                            {/* Motivational status: three tones only (slate < 50%, amber 50–90%, lime ≥ 90%). */}
                            <div className={`mt-2 text-sm font-bold tracking-wide transition-colors whitespace-nowrap drop-shadow-sm ${
                                animatedUtilizationRate < 0.50 ? 'text-slate-500 dark:text-slate-400' :
                                animatedUtilizationRate < 0.90 ? 'text-amber-600 dark:text-amber-300' :
                                'text-lime-800 dark:text-lime-300'
                            }`}>
                                {animatedUtilizationRate < 0.20 ? <>💀 Смерть в нищете</> : animatedUtilizationRate < 0.40 ? <>🪱 Червь</> : animatedUtilizationRate < 0.50 ? <>🐣 Салэпа</> : animatedUtilizationRate < 0.60 ? <>🦐 Креветко</> : animatedUtilizationRate < 0.70 ? <>🪿 Гусь</> : animatedUtilizationRate < 0.80 ? <>🦫 Бобер</> : animatedUtilizationRate < 0.90 ? <>🐗 Кабан</> : animatedUtilizationRate < 0.95 ? <>🦍 Мощь</> : animatedUtilizationRate < 1 ? <>🐘 Слоняра</> : <>🦖 Динозавр</>}
                            </div>
                        </div>
                    </div>

                    {/* Bottom Section: Numbers + Progress Bar */}
                    <div className="absolute bottom-0 left-0 w-full flex flex-col">
                        {/* Numbers */}
                        <div className="flex w-full mb-1 text-[11px] font-medium text-slate-500 dark:text-slate-400 px-0.5">
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
                        <div className="flex h-3 w-full overflow-hidden">
                            {occupancySegments.map(segment => (
                                <div key={segment.className} style={{ width: `${segment.ratio * 100}%`, animationDuration: `${segment.duration}ms`, animationDelay: `${segment.delay}ms` }} className={`rent-occupancy-segment ${segment.className}`} />
                            ))}
                        </div>
                    </div>
                </div>
            </div>

            <div className="mt-6">
                <div className="flex flex-col gap-3 items-stretch sm:flex-row">
                    <div className="relative flex-1 max-w-lg">
                        <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3">
                            <Search className="h-5 w-5 text-slate-500 dark:text-slate-400" />
                        </div>
                        <input
                            id="tenant-search"
                            type="text"
                            aria-label="Поиск арендаторов"
                            className="block w-full h-full rounded-md border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-slate-900 dark:text-white pl-10 py-2 border sm:text-sm focus:border-lime-500 focus:ring-lime-500 placeholder-slate-500"
                            placeholder="Поиск"
                            value={search}
                            onChange={(e) => setSearch(e.target.value)}
                        />
                    </div>

                    <div className="relative flex-none rounded-lg border border-slate-200 bg-slate-100 p-1 shadow-sm dark:border-slate-800 dark:bg-slate-950" role="group" aria-label="Статус арендаторов">
                        <button
                            type="button"
                            aria-pressed={!showArchived}
                            onClick={() => setShowArchived(false)}
                            className={`h-full rounded-md px-3 py-1.5 text-xs font-semibold transition-all sm:px-4 sm:text-sm ${!showArchived ? 'bg-white text-slate-950 shadow-sm dark:bg-slate-800 dark:text-white' : 'text-slate-500 hover:bg-white hover:text-slate-900 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-slate-200'}`}
                        >
                            Активные
                        </button>
                        <button
                            type="button"
                            aria-pressed={showArchived}
                            onClick={() => setShowArchived(true)}
                            aria-label="Показывать архивных"
                            className={`h-full rounded-md px-3 py-1.5 text-xs font-semibold transition-all sm:px-4 sm:text-sm ${showArchived ? 'bg-white text-slate-950 shadow-sm dark:bg-slate-800 dark:text-white' : 'text-slate-500 hover:bg-white hover:text-slate-900 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-slate-200'}`}
                        >
                            Архив
                        </button>
                    </div>

                    <button
                        aria-label="Добавить арендатора"
                        onClick={() => setIsTenantModalOpen(true)}
                        className="flex-none inline-flex items-center justify-center rounded-md border border-slate-200 bg-white px-3 sm:px-4 py-2 text-sm font-semibold text-slate-900 shadow-sm hover:bg-slate-50 transition-colors focus:outline-none focus:ring-2 focus:ring-lime-500 focus:ring-offset-2 focus:ring-offset-slate-900 dark:border-slate-700 dark:bg-slate-900 dark:text-white dark:hover:bg-slate-800"
                    >
                        <Plus className="h-5 w-5 sm:mr-1.5" />
                        <span className="hidden sm:inline">Добавить</span>
                    </button>
                </div>
            </div>

            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mt-6">
                {([
                    { id: 'today', label: 'Сегодня', value: dueTodayCount, color: 'text-slate-600 dark:text-slate-300', suffix: '' }
                ] as const).map(card => (
                    <button
                        key={card.id}
                        type="button"
                        onClick={() => card.id === 'today' ? navigate('/payments/today') : setTenantFilter(current => current === card.id ? 'all' : card.id)}
                        className={`rounded-lg border p-3 text-left transition-colors ${card.id === 'today' ? 'border-slate-200 bg-white hover:border-slate-400 dark:border-slate-700 dark:bg-slate-800/60 dark:hover:border-slate-500' : tenantFilter === card.id ? 'border-lime-500 bg-lime-50 dark:bg-lime-900/20' : 'border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 hover:border-slate-400 dark:hover:border-slate-500'}`}
                    >
                        <div className="text-[11px] font-medium text-slate-500 dark:text-slate-400 leading-tight">{card.label}</div>
                        <div className="mt-1 flex items-center justify-between gap-3">
                            <div className={`text-xl font-bold ${card.color}`}>{card.value}{card.suffix}</div>
                        {card.id === 'today' && <div className="ml-auto grid h-4 w-1/2 grid-cols-10 gap-0.5" aria-label="Доля должников среди активных арендаторов">
                            {Array.from({ length: 10 }, (_, index) => {
                                const isDebtor = index >= 10 - debtSlots;
                                return <span key={index} className={`rent-progress-cell h-full min-w-0 rounded-[2px] ${isDebtor ? 'bg-red-400 dark:bg-white/20' : 'bg-slate-300 dark:bg-white'}`} style={{ animationDelay: `${index * 35}ms` }} />;
                            })}
                            </div>}
                        </div>
                    </button>
                ))}
                <button type="button" onClick={() => setTenantFilter(current => current === 'debt' ? 'all' : 'debt')} className={`rounded-lg border p-3 text-left transition-colors ${tenantFilter === 'debt' ? 'border-red-400 bg-red-50 dark:bg-red-950/30' : 'border-slate-200 bg-white hover:border-slate-400 dark:border-slate-800 dark:bg-slate-900 dark:hover:border-slate-500'}`}>
                    <div className="text-[11px] font-medium leading-tight text-slate-500 dark:text-slate-400">Долги всего</div>
                    <div className="mt-1 text-xl font-bold text-red-600 dark:text-red-400">{formatZl(totalOutstandingDebt)}</div>
                </button>
            </div>

            {/* Mobile View (Cards) */}
            <div className="mt-6 sm:hidden space-y-2">
                {filteredTenants.map((tenant) => {
                    const { totalDebt, nextPaymentDate } = tenant.debtSummary;
                    return (
                        <div
                            key={tenant.id}
                            onClick={() => handleRowClick(tenant)}
                            className="rounded-lg p-3 border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-sm cursor-pointer flex items-center justify-between gap-4"
                        >
                            <div className="min-w-0 flex-1">
                                <div className="font-bold text-slate-900 dark:text-white truncate flex items-center gap-2">
                                    {tenant.name}
                                    {tenant.is_archived && <span className="bg-slate-100 dark:bg-slate-700 text-slate-500 px-1.5 py-0.5 rounded text-[9px] uppercase font-bold tracking-wider">А</span>}
                                </div>
                                <div className="text-xs text-slate-500 dark:text-slate-400 truncate">{tenant.bikes?.model || 'Нет велосипеда'}</div>
                            </div>

                            <div className="flex flex-col items-end justify-center py-1">
                                <div className="flex items-center gap-3">
                                    <div className="text-xs text-slate-500 dark:text-slate-400 font-medium tracking-tight">
                                        {nextPaymentDate ? formatRussianShortDate(nextPaymentDate) : '—'}
                                    </div>
                                    {totalDebt > 0 && (
                                        <span className="inline-flex items-center px-2 py-1.5 rounded-md text-xs font-bold bg-red-100/30 text-red-600 dark:bg-red-900/20 dark:text-red-500 uppercase border border-red-200/30 dark:border-red-800/30 leading-none">
                                            -{Number(totalDebt).toLocaleString('ru-RU')} zł
                                        </span>
                                    )}
                                </div>
                            </div>

                        </div>
                    );
                })}
                {!loading && filteredTenants.length === 0 && (
                    <EmptyState title="Нет арендаторов для отображения" action={<Button variant="secondary" onClick={() => { setSearch(''); setTenantFilter('all'); }}>Сбросить фильтры</Button>} />
                )}
            </div>

            {/* Desktop View (Table) */}
            <div className="mt-8 hidden sm:flex flex-col">
                <div className="-my-2 -mx-4 overflow-x-auto sm:-mx-6 lg:-mx-8">
                    <div className="inline-block min-w-full py-2 align-middle md:px-6 lg:px-8">
                        <div className="overflow-hidden shadow ring-1 ring-slate-200 dark:ring-black ring-opacity-5 rounded-lg border border-slate-200 dark:border-slate-800">
                            <table className="min-w-[640px] w-full divide-y divide-slate-100 dark:divide-slate-700">
                                <thead className="bg-white dark:bg-slate-900">
                                    <tr>
                                        <th className="py-3 pl-4 pr-3 text-left text-xs font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wider sm:pl-6">Имя</th>
                                        <th className="px-3 py-3 text-left text-xs font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wider">Велосипед</th>
                                        <th className="px-3 py-3 text-left text-xs font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wider">Баланс</th>
                                        <th className="px-3 py-3 text-left text-xs font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wider">След. платеж</th>
                                        <th className="relative py-3 pl-3 pr-4 sm:pr-6"><span className="sr-only">Действия</span></th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-100 dark:divide-slate-700 bg-transparent">
                                    {filteredTenants.map((tenant) => {
                                        const { totalDebt, nextPaymentDate } = tenant.debtSummary;
                                        return (
                                            <tr key={tenant.id} onClick={() => handleRowClick(tenant)} className="cursor-pointer group transition-colors hover:bg-black/5 dark:hover:bg-white/10">
                                                <td className="whitespace-nowrap py-4 pl-4 pr-3 text-sm sm:pl-6">
                                                    <div className="flex items-center">
                                                        <div className="ml-0">
                                                            <div className={`font-medium flex items-center gap-2 ${tenant.is_archived ? 'text-slate-500 dark:text-slate-400' : 'text-slate-950 dark:text-white'}`}>
                                                                {tenant.name}
                                                                {tenant.is_archived && <span className="bg-slate-100 dark:bg-slate-700 text-slate-500 dark:text-slate-300 px-2 py-0.5 rounded text-[10px] uppercase font-bold tracking-wider">Архив</span>}
                                                            </div>
                                                            <div onClick={e => e.stopPropagation()}>
                                                                <Link to={`/${tenant.slug}`} target="_blank" className="text-xs text-slate-500 hover:text-lime-800 dark:text-slate-400 dark:hover:text-lime-400 flex items-center mt-0.5">
                                                                    /{tenant.slug} <ExternalLink className="w-3 h-3 ml-1" />
                                                                </Link>
                                                            </div>
                                                        </div>
                                                    </div>
                                                </td>
                                                <td className="whitespace-nowrap px-3 py-4 text-sm text-slate-950 dark:text-slate-300">
                                                    {tenant.bikes?.model || '—'}
                                                </td>
                                                <td className="whitespace-nowrap px-3 py-4 text-sm">
                                                    {totalDebt > 0 ? (
                                                        <span className="font-medium text-red-600 dark:text-red-400">
                                                            -{Number(totalDebt).toLocaleString('ru-RU')}{' '}zł
                                                        </span>
                                                    ) : (
                                                        <StatusBadge tone="lime">
                                                            Оплачено
                                                        </StatusBadge>
                                                    )}
                                                </td>
                                                <td className="whitespace-nowrap px-3 py-4 text-sm text-slate-950 dark:text-slate-400">
                                                    {nextPaymentDate && formatRussianShortDate(nextPaymentDate)}
                                                </td>
                                                <td className="relative whitespace-nowrap py-4 pl-3 pr-4 text-right text-sm font-medium sm:pr-6">
                                                    <div className="flex justify-end gap-2 relative">
                                                    </div>
                                                </td>
                                            </tr>
                                        );
                                    })}
                                    {!loading && filteredTenants.length === 0 && (
                                        <tr><td colSpan={5}><EmptyState title="Нет арендаторов для отображения" /></td></tr>
                                    )}
                                    {loading && (
                                        <tr><td colSpan={5} className="px-4 py-5"><LoadingState label="Загрузка арендаторов…" /></td></tr>
                                    )}
                                </tbody>
                            </table>
                        </div>
                    </div>
                </div>
            </div>

            <Dialog open={isTenantModalOpen} ariaLabel="Новый арендатор" onClose={() => setIsTenantModalOpen(false)}>
                <TenantCreateModal
                    bikes={rentalBikesQuery.data || []}
                    bikesLoading={rentalBikesQuery.isLoading}
                    onClose={() => setIsTenantModalOpen(false)}
                    onSuccess={() => { setIsTenantModalOpen(false); queryClient.invalidateQueries({ queryKey: queryKeys.tenants.all }); queryClient.invalidateQueries({ queryKey: queryKeys.bikes.all }); }}
                />
            </Dialog>
        </div>
    );
}

function useAnimatedNumber(target: number, duration: number): number {
    const [value, setValue] = useState(0);

    useEffect(() => {
        let frame = 0;
        const startedAt = performance.now();
        setValue(0);

        const tick = (now: number) => {
            const progress = Math.min((now - startedAt) / duration, 1);
            const easedProgress = 1 - Math.pow(1 - progress, 3);
            setValue(target * easedProgress);
            if (progress < 1) frame = requestAnimationFrame(tick);
        };

        frame = requestAnimationFrame(tick);
        return () => cancelAnimationFrame(frame);
    }, [target, duration]);

    return value;
}
