import { useState, useMemo, type FormEvent } from 'react';
import { BatteryCharging, Plus, RotateCcw, Search } from 'lucide-react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import { fetchBatteries, fetchInventory, saveBattery } from '../../features/bikes/api';
import type { Battery, Bike, BikeStatus } from '../../types';
import { Dialog, EmptyState, ErrorState, LoadingState } from '../../shared/ui';
import { BIKE_STATUS_LABELS } from '../../features/bikes/status';
import { queryKeys } from '../../shared/lib/queryKeys';
import { getErrorMessage } from '../../shared/lib/errors';
import { BikeModal } from './BikeModal';
import { BikeInventoryList, type BikeSortField } from './BikeInventoryList';
import { useI18n } from '../../i18n';

type BikeType = 'mtb' | 'fat';

export default function AdminBikes() {
    const navigate = useNavigate();
    const queryClient = useQueryClient();
    const { t } = useI18n();
    const [search, setSearch] = useState('');
    const [statusFilter, setStatusFilter] = useState<'all' | BikeStatus>('all');
    const [typeFilter, setTypeFilter] = useState<'all' | BikeType>('all');
    const [sortBy, setSortBy] = useState<BikeSortField>('model');
    const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('asc');

    const [isModalOpen, setIsModalOpen] = useState(false);
    const [activeTab, setActiveTab] = useState<'bikes' | 'batteries'>('bikes');
    const [batteryCode, setBatteryCode] = useState('');
    const [batterySaving, setBatterySaving] = useState(false);

    const { data: bikes = [], isLoading: bikesLoading, isError: bikesError, error: bikesQueryError, refetch: refetchBikes } = useQuery<Bike[]>({
        queryKey: queryKeys.bikes.all,
        queryFn: fetchInventory
    });
    const { data: batteries = [], isLoading: batteriesLoading, isError: batteriesError, error: batteriesQueryError, refetch: refetchBatteries } = useQuery<Battery[]>({ queryKey: queryKeys.batteries.all, queryFn: fetchBatteries });

    const hasFilters = Boolean(search.trim()) || statusFilter !== 'all' || typeFilter !== 'all';

    const filteredAndSortedBikes = useMemo(() => {
        let result = [...bikes];
        const query = search.trim().toLowerCase();

        if (query) {
            result = result.filter(b => (b.model || '').toLowerCase().includes(query));
        }

        if (statusFilter !== 'all') {
            result = result.filter(b => b.status === statusFilter);
        }

        if (typeFilter !== 'all') {
            result = result.filter(b => b.type === typeFilter);
        }

        result.sort((a, b) => {
            let valA = a[sortBy] || '';
            let valB = b[sortBy] || '';

            if (typeof valA === 'string') {
                valA = valA.toLowerCase();
                valB = valB.toLowerCase();
            }

            if (valA < valB) return sortOrder === 'asc' ? -1 : 1;
            if (valA > valB) return sortOrder === 'asc' ? 1 : -1;
            return 0;
        });

        return result;
    }, [bikes, search, statusFilter, typeFilter, sortBy, sortOrder]);

    const toggleSort = (field: BikeSortField) => {
        if (sortBy === field) {
            setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc');
        } else {
            setSortBy(field);
            setSortOrder('asc');
        }
    };

    const resetFilters = () => {
        setSearch('');
        setStatusFilter('all');
        setTypeFilter('all');
        setSortBy('model');
        setSortOrder('asc');
    };

    const addBattery = async (event: FormEvent<HTMLFormElement>) => {
        event.preventDefault();
        setBatterySaving(true);
        try {
            await saveBattery(batteryCode);
            setBatteryCode('');
            await queryClient.invalidateQueries({ queryKey: queryKeys.batteries.all });
        } catch (error) {
            toast.error(t(getErrorMessage(error)));
        } finally {
            setBatterySaving(false);
        }
    };

    return (
        <div className="space-y-6">
            <div className="flex flex-col gap-4">
                {bikesError && (
                    <ErrorState message={`${t('Не удалось загрузить данные велосипедов.')} ${t(getErrorMessage(bikesQueryError))}`} retry={() => { void refetchBikes(); }} />
                )}
                <div className="flex justify-between items-center gap-4">
                    <h1 className="text-2xl font-bold text-slate-950 dark:text-white">{t('Инвентарь')}</h1>
                    {activeTab === 'bikes' && <button
                        type="button"
                        aria-label={t('Добавить велосипед')}
                        title={t('Добавить велосипед')}
                        onClick={() => setIsModalOpen(true)}
                        className="inline-flex min-h-10 min-w-10 items-center justify-center rounded-md border border-transparent bg-lime-600 p-2 text-sm font-semibold text-slate-950 shadow-sm hover:bg-lime-700 transition-colors focus:outline-none"
                    >
                        <Plus className="h-5 w-5" />
                    </button>}
                </div>

                <div className="flex w-fit rounded-lg border border-slate-200 bg-slate-100 p-1 dark:border-slate-800 dark:bg-slate-900"><button type="button" onClick={() => setActiveTab('bikes')} className={`rounded-md px-4 py-2 text-sm font-bold ${activeTab === 'bikes' ? 'bg-white text-lime-800 shadow-sm dark:bg-slate-700 dark:text-lime-400' : 'text-slate-500'}`}>{t('Велосипеды')}</button><button type="button" onClick={() => setActiveTab('batteries')} className={`inline-flex items-center gap-2 rounded-md px-4 py-2 text-sm font-bold ${activeTab === 'batteries' ? 'bg-white text-lime-800 shadow-sm dark:bg-slate-700 dark:text-lime-400' : 'text-slate-500'}`}><BatteryCharging className="h-4 w-4" />{t('Батареи')} <span className="text-xs opacity-60">{batteries.length}</span></button></div>

                {activeTab === 'bikes' && <div className="flex flex-col md:flex-row gap-3">
                    <div className="relative flex-1">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" aria-hidden="true" />
                        <label htmlFor="bike-search" className="sr-only">{t('Поиск велосипедов')}</label>
                        <input
                            id="bike-search"
                            type="text"
                            placeholder={t('Поиск')}
                            value={search}
                            onChange={(e) => setSearch(e.target.value)}
                            className="w-full pl-9 pr-4 py-2 border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 rounded-lg text-sm focus:ring-2 focus:ring-lime-500 outline-none dark:text-white"
                        />
                    </div>
                    <div className="flex flex-wrap gap-2">
                        <div className="flex p-1 bg-slate-100 dark:bg-slate-900 rounded-lg border border-slate-200 dark:border-slate-800">
                            {([
                                { id: 'all', label: 'Все' },
                                { id: 'available', label: BIKE_STATUS_LABELS.available },
                                { id: 'in_rent', label: BIKE_STATUS_LABELS.in_rent },
                                { id: 'maintenance', label: BIKE_STATUS_LABELS.maintenance }
                            ] as const).map((s) => (
                                <button
                                    key={s.id}
                                    onClick={() => setStatusFilter(s.id)}
                                    className={`px-3 py-1 text-xs font-medium rounded-md transition-all ${
                                        statusFilter === s.id
                                            ? 'bg-white dark:bg-slate-700 text-lime-800 dark:text-lime-400 shadow-sm'
                                            : 'text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200'
                                    }`}
                                >
                                    {t(s.label)}
                                </button>
                            ))}
                        </div>

                        <div className="flex p-1 bg-slate-100 dark:bg-slate-900 rounded-lg border border-slate-200 dark:border-slate-800">
                            {([
                                { id: 'all', label: 'Все' },
                                { id: 'mtb', label: 'Mtb' },
                                { id: 'fat', label: 'Fat' }
                            ] as const).map((item) => (
                                <button
                                    key={item.id}
                                    onClick={() => setTypeFilter(item.id)}
                                    className={`px-3 py-1 text-xs font-bold rounded-md transition-all ${
                                        typeFilter === item.id
                                            ? 'bg-white dark:bg-slate-700 text-lime-800 dark:text-lime-400 shadow-sm'
                                            : 'text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200'
                                    }`}
                                >
                                    {t(item.label)}
                                </button>
                            ))}
                        </div>
                    </div>
                </div>}
            </div>

            {activeTab === 'bikes' && (bikesLoading
                ? <div className="rounded-lg border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900"><LoadingState /></div>
                : filteredAndSortedBikes.length === 0 && hasFilters
                    ? <EmptyState title={t('Ничего не найдено')} action={<button type="button" onClick={resetFilters} className="inline-flex items-center gap-2 rounded-md border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-100 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"><RotateCcw className="h-4 w-4" />{t('Сбросить фильтры')}</button>} />
                    : <BikeInventoryList bikes={filteredAndSortedBikes} onSort={toggleSort} onSelect={(bikeId) => navigate(`/bike/${bikeId}`)} sortBy={sortBy} sortOrder={sortOrder} />)}

            {activeTab === 'batteries' && <section className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900 sm:p-6"><div className="mb-5"><h2 className="text-lg font-bold text-slate-900 dark:text-white">{t('Батареи')}</h2><p className="mt-1 text-sm text-slate-500 dark:text-slate-400">{t('Добавляйте батареи в общий инвентарь. Привязку к велосипедам сделаем следующим этапом.')}</p></div><form onSubmit={addBattery} className="mb-6 flex flex-col gap-3 sm:flex-row"><label htmlFor="battery-code" className="sr-only">{t('Трёхзначный код батареи')}</label><input id="battery-code" required pattern="[0-9]{3}" maxLength={3} inputMode="numeric" value={batteryCode} onChange={event => setBatteryCode(event.target.value.replace(/\D/g, '').slice(0, 3))} placeholder={t('Трёхзначный код, например 101')} className="min-h-11 flex-1 rounded-lg border border-slate-200 bg-white px-3 text-slate-900 outline-none focus:border-lime-500 dark:border-slate-700 dark:bg-slate-950 dark:text-white" /><button type="submit" disabled={batterySaving} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-lg bg-lime-500 px-5 font-bold text-slate-950 hover:bg-lime-400 disabled:opacity-50"><Plus className="h-4 w-4" />{batterySaving ? t('Добавление…') : t('Добавить батарею')}</button></form>{batteriesError && <ErrorState message={`${t('Не удалось загрузить батареи.')} ${t(getErrorMessage(batteriesQueryError))}`} retry={() => { void refetchBatteries(); }} />}{batteriesLoading ? <LoadingState /> : batteries.length === 0 ? <EmptyState title={t('Батарей пока нет')} /> : <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-6">{batteries.map(battery => <div key={battery.id} className="rounded-xl border border-slate-200 bg-slate-50 p-4 text-center dark:border-slate-700 dark:bg-slate-950"><BatteryCharging className="mx-auto h-5 w-5 text-slate-400" /><div className="mt-2 text-2xl font-bold tracking-wider text-slate-900 dark:text-white">{battery.code}</div><div className="mt-1 text-[10px] font-bold uppercase text-lime-800 dark:text-lime-300">{t('Свободна')}</div></div>)}</div>}</section>}

            <Dialog open={isModalOpen} ariaLabel={t('Новый велосипед')} onClose={() => setIsModalOpen(false)}>
                <BikeModal
                    bike={null}
                    assignedTenant={null}
                    onClose={() => setIsModalOpen(false)}
                    onSuccess={() => { setIsModalOpen(false); queryClient.invalidateQueries({ queryKey: queryKeys.bikes.all }); queryClient.invalidateQueries({ queryKey: queryKeys.tenants.all }); }}
                />
            </Dialog>
        </div>
    );
}
