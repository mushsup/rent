import { lazy, Suspense, useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Plus, Search, ExternalLink } from 'lucide-react';
import { format } from 'date-fns';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import type { Bike, Tenant } from '../../types';
import { fetchBikes, fetchDashboardTenants } from '../../features/tenants/api';
import { queryKeys } from '../../shared/lib/queryKeys';
import { TenantCreateModal } from './TenantCreateModal';
import { Dialog } from '../../shared/ui';
import {
    buildRevenueChartData,
    buildTenantSummaries,
    filterDashboardTenants,
    getDashboardStats,
    type ChartPeriod,
    type TenantFilter
} from './dashboardSelectors';

const RevenueChart = lazy(() => import('./RevenueChart'));
export default function AdminDashboard() {
    const queryClient = useQueryClient();
    const navigate = useNavigate();
    const [search, setSearch] = useState('');
    const [chartPeriod, setChartPeriod] = useState<ChartPeriod>('month');
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

    const { data: bikes = [], isError: bikesError } = useQuery<Bike[]>({
        queryKey: queryKeys.bikes.all,
        queryFn: fetchBikes
    });

    const { data: tenants = [], isLoading: loading, isError: tenantsError, error: tenantsQueryError } = useQuery<Tenant[]>({
        queryKey: queryKeys.tenants.dashboard(showArchived),
        queryFn: () => fetchDashboardTenants(showArchived)
    });

    const referenceDate = useMemo(() => new Date(), []);
    const tenantSummaries = useMemo(() => buildTenantSummaries(tenants, referenceDate), [tenants, referenceDate]);
    const stats = useMemo(() => getDashboardStats(tenantSummaries, bikes, referenceDate), [tenantSummaries, bikes, referenceDate]);
    const chartData = useMemo(() => buildRevenueChartData(tenants, chartPeriod, referenceDate), [tenants, chartPeriod, referenceDate]);
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
        overdueCount,
        dueTodayCount,
        upcomingCount,
        totalOutstandingDebt
    } = stats;

    const handleRowClick = (tenant: Tenant) => {
        if (tenant.id) navigate(`/admin/tenant/${tenant.id}`);
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
                <div className="bg-white dark:bg-slate-900 rounded-lg border border-slate-200 dark:border-slate-800 p-5 shadow-sm lg:col-span-2 flex flex-col h-full min-h-[240px]">
                    <div className="flex justify-end items-center mb-4">
                        <div className="flex bg-slate-100 dark:bg-slate-900 rounded-lg p-1 border border-slate-200 dark:border-slate-800">
                            {(['week', 'month', 'year'] as const).map((period) => (
                                <button
                                    key={period}
                                    onClick={() => setChartPeriod(period)}
                                    className={`px-3 py-1 text-xs font-medium rounded-md transition-colors ${chartPeriod === period ? 'bg-lime-600 text-slate-950 shadow-sm' : 'text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white hover:bg-white dark:hover:bg-slate-800'}`}
                                >
                                    {period === 'week' ? 'Нед' : period === 'month' ? 'Мес' : 'Год'}
                                </button>
                            ))}
                        </div>
                    </div>
                    <div className="w-full mt-2 flex-1 focus:outline-none" style={{ outline: 'none' }}>
                        <Suspense fallback={<div className="h-full min-h-[170px] animate-pulse rounded-lg bg-slate-100 dark:bg-slate-900/60" />}>
                            {chartReady ? <RevenueChart data={chartData} /> : <div className="h-full min-h-[170px] rounded-lg bg-slate-100 dark:bg-slate-900/60" />}
                        </Suspense>
                    </div>
                </div>

                {/* Occupancy/Revenue Card */}
                <div className="bg-white dark:bg-slate-900 rounded-lg border border-slate-200 dark:border-slate-800 transition-all shadow-sm flex flex-col h-full relative overflow-hidden min-h-[240px]">
                    {/* Top Controls: Tabs */}
                    <div className="absolute top-4 right-4 z-10 flex bg-slate-100 dark:bg-slate-900 rounded-lg p-1 border border-slate-200 dark:border-slate-800">
                        <button
                            onClick={() => setStatsTab('percent')}
                            className={`px-3 py-1 text-xs font-medium rounded-md transition-colors ${statsTab === 'percent' ? 'bg-lime-600 text-slate-950 shadow-sm' : 'text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white hover:bg-white dark:hover:bg-slate-800'}`}
                        >
                            %
                        </button>
                        <button
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
                                        <span>{Math.round(utilizationRate * 100)}</span>
                                        <span className="text-2xl sm:text-3xl text-slate-500 dark:text-slate-400 font-medium whitespace-nowrap">/ 100%</span>
                                    </>
                                ) : (
                                    <>
                                        <span>{activeMonthlyRevenue.toLocaleString('ru-RU')}</span>
                                        <span className="text-2xl sm:text-3xl text-slate-500 dark:text-slate-400 font-medium whitespace-nowrap">zł/мес</span>
                                    </>
                                )}
                            </div>

                            {/* Motivational Badge */}
                            <div className="mt-2">
                                <span className={`inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-extrabold uppercase border shadow-sm transition-all whitespace-nowrap ${
                                    utilizationRate < 0.40 ? 'bg-slate-100 dark:bg-slate-700 text-slate-900 dark:text-slate-200 border-slate-200 dark:border-slate-600' :
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
                            <Search className="h-5 w-5 text-slate-500 dark:text-slate-400" />
                        </div>
                        <input
                            type="text"
                            className="block w-full h-full rounded-md border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-slate-900 dark:text-white pl-10 py-2 border sm:text-sm focus:border-lime-500 focus:ring-lime-500 placeholder-slate-500"
                            placeholder="Поиск"
                            value={search}
                            onChange={(e) => setSearch(e.target.value)}
                        />
                    </div>

                    <div className="relative flex-none rounded-lg border border-slate-800 bg-slate-950 p-1 shadow-sm" role="group" aria-label="Статус арендаторов">
                        <button
                            type="button"
                            aria-pressed={!showArchived}
                            onClick={() => setShowArchived(false)}
                            className={`h-full rounded-md px-3 py-1.5 text-xs font-semibold transition-all sm:px-4 sm:text-sm ${!showArchived ? 'bg-slate-800 text-white shadow' : 'text-slate-500 hover:bg-slate-900 hover:text-slate-300'}`}
                        >
                            Активные
                        </button>
                        <button
                            type="button"
                            aria-pressed={showArchived}
                            onClick={() => setShowArchived(true)}
                            aria-label="Показывать архивных"
                            className={`h-full rounded-md px-3 py-1.5 text-xs font-semibold transition-all sm:px-4 sm:text-sm ${showArchived ? 'bg-slate-800 text-lime-400 shadow' : 'text-slate-500 hover:bg-slate-900 hover:text-slate-300'}`}
                        >
                            Архив
                        </button>
                    </div>

                    <button
                        aria-label="Добавить арендатора"
                        onClick={() => setIsTenantModalOpen(true)}
                        className="flex-none inline-flex items-center justify-center rounded-md border border-transparent bg-lime-600 px-3 sm:px-4 py-2 text-sm font-semibold text-slate-950 shadow-sm hover:bg-lime-700 transition-colors focus:outline-none focus:ring-2 focus:ring-lime-500 focus:ring-offset-2 focus:ring-offset-slate-900"
                    >
                        <Plus className="h-5 w-5 sm:mr-1.5" />
                        <span className="hidden sm:inline">Добавить</span>
                    </button>
                </div>
            </div>

            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mt-6">
                {([
                    { id: 'overdue', label: 'Просрочено', value: overdueCount, color: 'text-red-500', suffix: '' },
                    { id: 'today', label: 'Платежи сегодня', value: dueTodayCount, color: 'text-orange-500', suffix: '' },
                    { id: 'upcoming', label: 'Ближайшие 7 дней', value: upcomingCount, color: 'text-lime-800 dark:text-lime-400', suffix: '' },
                    { id: 'debt', label: 'Долги всего', value: totalOutstandingDebt.toLocaleString('ru-RU'), color: 'text-red-500', suffix: ' zł' }
                ] as const).map(card => (
                    <button
                        key={card.id}
                        type="button"
                        onClick={() => setTenantFilter(current => current === card.id ? 'all' : card.id)}
                        className={`rounded-lg border p-3 text-left transition-colors ${tenantFilter === card.id ? 'border-lime-500 bg-lime-50 dark:bg-lime-900/20' : 'border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 hover:border-slate-400 dark:hover:border-slate-500'}`}
                    >
                        <div className="text-[11px] font-medium text-slate-500 dark:text-slate-400 leading-tight">{card.label}</div>
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
                    <div className="py-8 text-center text-slate-500 dark:text-slate-400">Нет данных для отображения.</div>
                )}
            </div>

            {/* Desktop View (Table) */}
            <div className="mt-8 hidden sm:flex flex-col">
                <div className="-my-2 -mx-4 overflow-x-auto sm:-mx-6 lg:-mx-8 pb-32">
                    <div className="inline-block min-w-full py-2 align-middle md:px-6 lg:px-8">
                        <div className="overflow-hidden shadow ring-1 ring-slate-200 dark:ring-black ring-opacity-5 rounded-lg border border-slate-200 dark:border-slate-800">
                            <table className="min-w-full divide-y divide-slate-100 dark:divide-slate-700">
                                <thead className="bg-white dark:bg-slate-900">
                                    <tr>
                                        <th className="py-3 pl-4 pr-3 text-left text-xs font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wider sm:pl-6">Имя</th>
                                        <th className="px-3 py-3 text-left text-xs font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wider">Велосипед</th>
                                        <th className="px-3 py-3 text-left text-xs font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wider">Баланс</th>
                                        <th className="px-3 py-3 text-left text-xs font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wider">Статус</th>
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
                                                            <div className={`font-medium flex items-center gap-2 ${tenant.is_archived ? 'text-slate-500 dark:text-slate-400' : 'text-black dark:text-white'}`}>
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
                                                <td className="whitespace-nowrap px-3 py-4 text-sm text-black dark:text-slate-300">
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
                                                <td className="whitespace-nowrap px-3 py-4 text-sm text-black dark:text-slate-400">
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
                                        <tr><td colSpan={6} className="py-8 text-center text-slate-500 dark:text-slate-400">Нет данных для отображения.</td></tr>
                                    )}
                                    {loading && (
                                        <tr><td colSpan={6} className="py-8 text-center text-slate-500 dark:text-slate-400">Загрузка...</td></tr>
                                    )}
                                </tbody>
                            </table>
                        </div>
                    </div>
                </div>
            </div>

            <Dialog open={isTenantModalOpen} ariaLabel="Новый арендатор" onClose={() => setIsTenantModalOpen(false)}>
                <TenantCreateModal
                    bikes={bikes}
                    onClose={() => setIsTenantModalOpen(false)}
                    onSuccess={() => { setIsTenantModalOpen(false); queryClient.invalidateQueries({ queryKey: queryKeys.tenants.all }); queryClient.invalidateQueries({ queryKey: queryKeys.bikes.all }); }}
                />
            </Dialog>
        </div>
    );
}
