import { useState, useMemo } from 'react';
import { Plus, Search } from 'lucide-react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { fetchBikeTenants, fetchInventory } from '../../features/bikes/api';
import type { Bike, BikeStatus } from '../../types';
import { Dialog, LoadingState } from '../../shared/ui';
import { BIKE_STATUS_LABELS } from '../../features/bikes/status';
import { queryKeys } from '../../shared/lib/queryKeys';
import { BikeModal } from './BikeModal';
import { BikeInventoryList, type BikeSortField } from './BikeInventoryList';

type BikeType = 'mtb' | 'fat';

export default function AdminBikes() {
    const navigate = useNavigate();
    const queryClient = useQueryClient();
    const [search, setSearch] = useState('');
    const [statusFilter, setStatusFilter] = useState<'all' | BikeStatus>('all');
    const [typeFilter, setTypeFilter] = useState<'all' | BikeType>('all');
    const [sortBy, setSortBy] = useState<BikeSortField>('model');
    const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('asc');

    const [isModalOpen, setIsModalOpen] = useState(false);

    const { data: bikes = [], isLoading: bikesLoading, isError: bikesError } = useQuery<Bike[]>({
        queryKey: queryKeys.bikes.all,
        queryFn: fetchInventory
    });

    const { data: tenants = [], isLoading: tenantsLoading, isError: tenantsError } = useQuery({
        queryKey: queryKeys.bikes.tenants,
        queryFn: fetchBikeTenants
    });

    const loading = bikesLoading || tenantsLoading;
    const queryError = bikesError || tenantsError;

    const filteredAndSortedBikes = useMemo(() => {
        let result = [...bikes];

        // Search
        if (search) {
            result = result.filter(b => (b.model || '').toLowerCase().includes(search.toLowerCase()));
        }

        // Status Filter
        if (statusFilter !== 'all') {
            result = result.filter(b => b.status === statusFilter);
        }

        // Type Filter
        if (typeFilter !== 'all') {
            result = result.filter(b => b.type === typeFilter);
        }

        // Sort
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

    const openCreateModal = () => {
        setIsModalOpen(true);
    };

    return (
        <div className="space-y-6">
            <div className="flex flex-col gap-4">
                {queryError && (
                    <div className="rounded-lg border border-red-300/50 bg-red-50/50 px-4 py-3 text-sm text-red-600 dark:border-red-800/50 dark:bg-red-900/20 dark:text-red-300">
                        Не удалось загрузить данные велосипедов. Проверьте подключение к базе данных.
                    </div>
                )}
                <div className="flex justify-between items-center gap-4">
                    <h1 className="text-2xl font-bold text-black dark:text-white">Велосипеды</h1>
                    <button
                        onClick={openCreateModal}
                        className="inline-flex items-center justify-center rounded-md border border-transparent bg-lime-600 p-2 text-sm font-semibold text-slate-950 shadow-sm hover:bg-lime-700 transition-colors focus:outline-none"
                    >
                        <Plus className="h-5 w-5" />
                    </button>
                </div>

                <div className="flex flex-col md:flex-row gap-3">
                    <div className="relative flex-1">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                        <input
                            type="text"
                            placeholder="Поиск"
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
                                    {s.label}
                                </button>
                            ))}
                        </div>

                        <div className="flex p-1 bg-slate-100 dark:bg-slate-900 rounded-lg border border-slate-200 dark:border-slate-800">
                            {([
                                { id: 'all', label: 'Все' },
                                { id: 'mtb', label: 'Mtb' },
                                { id: 'fat', label: 'Fat' }
                            ] as const).map((t) => (
                                <button
                                    key={t.id}
                                    onClick={() => setTypeFilter(t.id)}
                                    className={`px-3 py-1 text-xs font-bold rounded-md transition-all ${
                                        typeFilter === t.id
                                            ? 'bg-white dark:bg-slate-700 text-lime-800 dark:text-lime-400 shadow-sm'
                                            : 'text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200'
                                    }`}
                                >
                                    {t.label}
                                </button>
                            ))}
                        </div>
                    </div>
                </div>
            </div>

            {loading
                ? <div className="rounded-lg border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900"><LoadingState /></div>
                : <BikeInventoryList bikes={filteredAndSortedBikes} tenants={tenants} onSort={toggleSort} onSelect={(bikeId) => navigate(`/admin/bike/${bikeId}`)} />}

            <Dialog open={isModalOpen} ariaLabel="Новый велосипед" onClose={() => setIsModalOpen(false)}>
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
