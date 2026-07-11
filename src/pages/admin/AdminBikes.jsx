import { useState, useMemo } from 'react';
import { supabase } from '../../lib/supabase';
import { Plus, Edit2, X, Trash2, ArrowUpDown, Search } from 'lucide-react';
import toast from 'react-hot-toast';
import { useQuery, useQueryClient } from '@tanstack/react-query';

export default function AdminBikes() {
    const queryClient = useQueryClient();
    const [search, setSearch] = useState('');
    const [statusFilter, setStatusFilter] = useState('all'); // all, available, in_rent, maintenance
    const [typeFilter, setTypeFilter] = useState('all'); // all, mtb, fat
    const [sortBy, setSortBy] = useState('model'); // model, status, type
    const [sortOrder, setSortOrder] = useState('asc'); // asc, desc

    const [isModalOpen, setIsModalOpen] = useState(false);
    const [editingBike, setEditingBike] = useState(null);

    const { data: bikes = [], isLoading: bikesLoading } = useQuery({
        queryKey: ['bikes'],
        queryFn: async () => {
            const { data } = await supabase.from('bikes').select('id, model, type, status').order('model');
            return data || [];
        }
    });

    const { data: tenants = [], isLoading: tenantsLoading } = useQuery({
        queryKey: ['tenants', 'bikes'],
        queryFn: async () => {
            const { data } = await supabase.from('tenants').select('id, name, bike_id');
            return data || [];
        }
    });

    const loading = bikesLoading || tenantsLoading;

    const filteredAndSortedBikes = useMemo(() => {
        let result = [...bikes];

        // Search
        if (search) {
            result = result.filter(b => b.model.toLowerCase().includes(search.toLowerCase()));
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

    const toggleSort = (field) => {
        if (sortBy === field) {
            setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc');
        } else {
            setSortBy(field);
            setSortOrder('asc');
        }
    };

    const openCreateModal = () => {
        setEditingBike(null);
        setIsModalOpen(true);
    };

    const openEditModal = (bike) => {
        setEditingBike(bike);
        setIsModalOpen(true);
    };

    const getTenantForBike = (bikeId) => {
        return tenants.find(t => t.bike_id === bikeId);
    };

    return (
        <div className="space-y-6">
            <div className="flex flex-col gap-4">
                <div className="flex justify-between items-center gap-4">
                    <h1 className="text-2xl font-bold text-black dark:text-white">Велосипеды</h1>
                    <button
                        onClick={openCreateModal}
                        className="inline-flex items-center justify-center rounded-md border border-transparent bg-indigo-600 p-2 text-sm font-medium text-white shadow-sm hover:bg-indigo-700 transition-colors focus:outline-none"
                    >
                        <Plus className="h-5 w-5" />
                    </button>
                </div>

                <div className="flex flex-col md:flex-row gap-3">
                    <div className="relative flex-1">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                        <input
                            type="text"
                            placeholder="Поиск"
                            value={search}
                            onChange={(e) => setSearch(e.target.value)}
                            className="w-full pl-9 pr-4 py-2 border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 outline-none dark:text-white"
                        />
                    </div>
                    <div className="flex flex-wrap gap-2">
                        <div className="flex p-1 bg-gray-100 dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700">
                            {[
                                { id: 'all', label: 'Все' },
                                { id: 'available', label: 'Свободен' },
                                { id: 'in_rent', label: 'В аренде' },
                                { id: 'maintenance', label: 'Ремонт' }
                            ].map((s) => (
                                <button
                                    key={s.id}
                                    onClick={() => setStatusFilter(s.id)}
                                    className={`px-3 py-1 text-xs font-medium rounded-md transition-all ${
                                        statusFilter === s.id 
                                            ? 'bg-white dark:bg-gray-700 text-indigo-600 dark:text-indigo-400 shadow-sm' 
                                            : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200'
                                    }`}
                                >
                                    {s.label}
                                </button>
                            ))}
                        </div>

                        <div className="flex p-1 bg-gray-100 dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700">
                            {[
                                { id: 'all', label: 'Все' },
                                { id: 'mtb', label: 'Mtb' },
                                { id: 'fat', label: 'Fat' }
                            ].map((t) => (
                                <button
                                    key={t.id}
                                    onClick={() => setTypeFilter(t.id)}
                                    className={`px-3 py-1 text-xs font-bold rounded-md transition-all ${
                                        typeFilter === t.id 
                                            ? 'bg-white dark:bg-gray-700 text-indigo-600 dark:text-indigo-400 shadow-sm' 
                                            : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200'
                                    }`}
                                >
                                    {t.label}
                                </button>
                            ))}
                        </div>
                    </div>
                </div>
            </div>

            <div className="bg-white dark:bg-gray-800 rounded-xl shadow-lg border border-gray-200 dark:border-gray-700 overflow-hidden">
                {/* Mobile View: Compact List */}
                <div className="block sm:hidden divide-y divide-gray-100 dark:divide-gray-700/50">
                    {filteredAndSortedBikes.map((bike) => {
                        const tenant = getTenantForBike(bike.id);
                        return (
                            <div key={bike.id} className="p-3">
                                <div className="flex justify-between items-start mb-1.5">
                                    <div className="flex items-center gap-2 flex-1 pr-2 min-w-0">
                                        <div className="text-sm font-bold text-gray-900 dark:text-white uppercase tracking-tight truncate">{bike.model}</div>
                                        {tenant && (
                                            <span className="text-[11px] font-medium text-gray-400 dark:text-white/50 truncate">
                                                {tenant.name}
                                            </span>
                                        )}
                                    </div>
                                    <div className="flex items-center gap-2 flex-shrink-0">
                                        <button
                                            onClick={() => openEditModal(bike)}
                                            className="text-gray-400 hover:text-indigo-400 transition-colors p-0.5"
                                        >
                                            <Edit2 className="w-3.5 h-3.5" />
                                        </button>
                                    </div>
                                </div>
                                <div className="flex items-center gap-2">
                                    {bike.status === 'available' && (
                                        <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-bold bg-gray-100/50 text-gray-400 dark:bg-gray-800/50 dark:text-gray-500 uppercase border border-gray-200 dark:border-gray-700">
                                            Свободен
                                        </span>
                                    )}
                                    {bike.status === 'in_rent' && (
                                        <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-bold bg-green-100/30 text-green-600 dark:bg-green-900/20 dark:text-green-500 uppercase border border-green-200/30 dark:border-green-800/30">
                                            В аренде
                                        </span>
                                    )}
                                    {bike.status === 'maintenance' && (
                                        <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-bold bg-orange-100/30 text-orange-600 dark:bg-orange-900/20 dark:text-orange-500 uppercase border border-orange-200/30 dark:border-orange-800/30">
                                            Ремонт
                                        </span>
                                    )}
                                    <span className="text-[10px] text-gray-400 dark:text-gray-500 font-bold uppercase tracking-widest">{bike.type}</span>
                                </div>
                            </div>
                        );
                    })}
                </div>

                {/* Desktop View: Table */}
                <div className="hidden sm:block overflow-x-auto">
                    <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
                        <thead className="bg-white dark:bg-gray-800/50">
                            <tr>
                                <th scope="col" onClick={() => toggleSort('model')} className="px-6 py-4 text-left text-xs font-semibold text-gray-600 dark:text-gray-300 uppercase tracking-wide cursor-pointer hover:text-indigo-500 transition-colors">
                                    <div className="flex items-center gap-1">
                                        Модель <ArrowUpDown className="w-3 h-3" />
                                    </div>
                                </th>
                                <th scope="col" onClick={() => toggleSort('type')} className="px-6 py-4 text-left text-xs font-semibold text-gray-600 dark:text-gray-300 uppercase tracking-wide cursor-pointer hover:text-indigo-500 transition-colors">
                                    <div className="flex items-center gap-1">
                                        Тип <ArrowUpDown className="w-3 h-3" />
                                    </div>
                                </th>
                                <th scope="col" onClick={() => toggleSort('status')} className="px-6 py-4 text-left text-xs font-semibold text-gray-600 dark:text-gray-300 uppercase tracking-wide cursor-pointer hover:text-indigo-500 transition-colors">
                                    <div className="flex items-center gap-1">
                                        Статус <ArrowUpDown className="w-3 h-3" />
                                    </div>
                                </th>
                                <th scope="col" className="relative px-6 py-4"><span className="sr-only">Действия</span></th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100 dark:divide-gray-700/50">
                            {filteredAndSortedBikes.map((bike) => {
                                const tenant = getTenantForBike(bike.id);
                                return (
                                    <tr key={bike.id} className="cursor-pointer transition-colors hover:bg-black/5 dark:hover:bg-white/10">
                                    <td className="whitespace-nowrap px-6 py-4">
                                        <div className="flex items-center gap-3">
                                            <div className="text-sm font-semibold text-black dark:text-white">{bike.model}</div>
                                            {tenant && (
                                                <span className="text-sm font-normal text-gray-400 dark:text-white/50">{tenant.name}</span>
                                            )}
                                        </div>
                                    </td>
                                    <td className="whitespace-nowrap px-6 py-4">
                                        <div className="text-xs text-gray-500 dark:text-gray-400 uppercase tracking-widest">{bike.type}</div>
                                    </td>
                                    <td className="whitespace-nowrap px-6 py-4 text-sm">
                                        {bike.status === 'available' && <span className="inline-flex rounded-md bg-gray-100/50 dark:bg-gray-800/40 px-2.5 py-1 text-[11px] font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wide border border-gray-200 dark:border-gray-700">Свободен</span>}
                                        {bike.status === 'in_rent' && <span className="inline-flex rounded-md bg-green-100/30 dark:bg-green-900/20 px-2.5 py-1 text-[11px] font-bold text-green-600 dark:text-green-400 uppercase tracking-wide border border-green-200/30 dark:border-green-800/30">В аренде</span>}
                                        {bike.status === 'maintenance' && <span className="inline-flex rounded-md bg-orange-100/30 dark:bg-orange-900/20 px-2.5 py-1 text-[11px] font-bold text-orange-600 dark:text-orange-400 uppercase tracking-wide border border-orange-200/30 dark:border-orange-800/30">Ремонт</span>}
                                    </td>
                                        <td className="whitespace-nowrap px-6 py-4 text-right text-sm font-medium">
                                            <button
                                                onClick={() => openEditModal(bike)}
                                                className="text-gray-500 dark:text-gray-400 hover:text-indigo-400 transition-colors inline-block p-1"
                                                title="Редактировать"
                                            >
                                                <Edit2 className="w-4 h-4" />
                                            </button>
                                        </td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                </div>

                {!loading && bikes.length === 0 && (
                    <div className="px-6 py-8 text-center text-gray-400 dark:text-gray-500 text-sm">
                        Велосипеды не найдены. Добавьте свой первый велосипед!
                    </div>
                )}
                {loading && (
                    <div className="px-6 py-8 text-center text-gray-400 dark:text-gray-500 text-sm flex items-center justify-center">
                        <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-indigo-500 mr-2"></div> Загрузка...
                    </div>
                )}
            </div>

            {isModalOpen && (
                <div className="fixed inset-0 z-50">
                    <div className="fixed inset-0 bg-gray-900/80 backdrop-blur-sm transition-opacity" onClick={() => setIsModalOpen(false)} />
                    <div className="fixed inset-0 z-10 flex items-center justify-center p-4 pointer-events-none">
                        <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl max-w-md w-full p-6 shadow-2xl relative pointer-events-auto">
                            <BikeModal
                                bike={editingBike}
                                assignedTenant={tenants.find(tenant => tenant.bike_id === editingBike?.id)}
                                onClose={() => setIsModalOpen(false)}
                                onSuccess={() => { setIsModalOpen(false); queryClient.invalidateQueries({ queryKey: ['bikes'] }); queryClient.invalidateQueries({ queryKey: ['tenants'] }); }}
                            />
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}

function BikeModal({ bike, assignedTenant, onClose, onSuccess }) {
    const [formData, setFormData] = useState({
        model: bike?.model || '',
        type: bike?.type || 'mtb',
        status: bike?.status || 'available'
    });
    const [loading, setLoading] = useState(false);
    const isEdit = !!bike;

    const handleSubmit = async (e) => {
        e.preventDefault();
        setLoading(true);

        const payload = {
            model: formData.model.trim(),
            type: formData.type.trim(),
            status: formData.status
        };

        let response;
        if (isEdit) {
            response = await supabase.from('bikes').update(payload).eq('id', bike.id);
            
            // Если статус меняется на свободный или ремонт - убираем связь с арендатором
            if (formData.status !== 'in_rent') {
                await supabase.from('tenants').update({ bike_id: null }).eq('bike_id', bike.id);
            }
        } else {
            response = await supabase.from('bikes').insert([payload]);
        }

        setLoading(false);
        if (!response.error) {
            toast.success(isEdit ? 'Обновлено успешно' : 'Создан новый велосипед');
            onSuccess();
        } else {
            toast.error(response.error.message);
        }
    };

    const handleDelete = async () => {
        if (!bike) return;
        if (assignedTenant) {
            toast.error(`Сначала отвяжите велосипед от арендатора ${assignedTenant.name}`);
            return;
        }
        if (!window.confirm(`Удалить велосипед «${bike.model}»? Это действие нельзя отменить.`)) return;

        setLoading(true);
        const { error } = await supabase.from('bikes').delete().eq('id', bike.id);
        setLoading(false);

        if (error) {
            toast.error(error.message);
            return;
        }

        toast.success('Велосипед удалён');
        onSuccess();
    };

    return (
        <div>
            <div className="flex justify-between items-center mb-4 border-b border-gray-200 dark:border-gray-700 pb-3">
                <h3 className="text-lg font-semibold text-gray-900 dark:text-white">{isEdit ? 'Редактировать велосипед' : 'Новый велосипед'}</h3>
                <button onClick={onClose} className="text-gray-500 dark:text-gray-400 hover:text-gray-900 dark:text-white transition-colors bg-gray-200/50 dark:bg-gray-700/50 hover:bg-gray-200 dark:bg-gray-700 p-1 rounded-md">
                    <X className="w-5 h-5" />
                </button>
            </div>
            <form onSubmit={handleSubmit} className="space-y-6 mt-4">
                <div>
                    <label className="block text-sm font-medium text-gray-600 dark:text-gray-300 mb-2">Модель</label>
                    <input type="text" required value={formData.model} onChange={e => setFormData({ ...formData, model: e.target.value })} className="block w-full rounded-md bg-white dark:bg-gray-700 border border-gray-200 dark:border-gray-600 text-gray-900 dark:text-white py-2 px-3 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 sm:text-sm" placeholder="Например: Engwe EP-2 Pro" />
                </div>
                <div>
                    <div>
                        <label className="block text-sm font-medium text-gray-600 dark:text-gray-300 mb-2">Тип</label>
                        <div className="flex p-1 bg-gray-100 dark:bg-gray-750 rounded-lg border border-gray-200 dark:border-gray-700">
                            {['mtb', 'fat'].map((t) => (
                                <button
                                    key={t}
                                    type="button"
                                    onClick={() => setFormData({ ...formData, type: t })}
                                    className={`flex-1 py-1.5 text-xs font-bold uppercase tracking-widest rounded-md transition-all ${
                                        formData.type === t 
                                            ? 'bg-indigo-600 text-white shadow-sm' 
                                            : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200'
                                    }`}
                                >
                                    {t}
                                </button>
                            ))}
                        </div>
                    </div>
                </div>

                <div>
                    <label className="block text-sm font-medium text-gray-600 dark:text-gray-300 mb-2">Статус</label>
                    <div className="flex p-1 bg-gray-100 dark:bg-gray-750 rounded-lg border border-gray-200 dark:border-gray-700">
                        {[
                            { id: 'available', label: 'Свободен' },
                            { id: 'in_rent', label: 'В аренде' },
                            { id: 'maintenance', label: 'Ремонт' }
                        ].map((s) => (
                            <button
                                key={s.id}
                                type="button"
                                onClick={() => setFormData({ ...formData, status: s.id })}
                                className={`flex-1 py-2 text-xs font-medium rounded-md transition-all ${
                                    formData.status === s.id 
                                        ? (s.id === 'in_rent' ? 'bg-green-600 text-white' : s.id === 'maintenance' ? 'bg-orange-600 text-white' : 'bg-indigo-600 text-white') + ' shadow-sm'
                                        : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200'
                                }`}
                            >
                                {s.label}
                            </button>
                        ))}
                    </div>
                </div>

                <div className={`${isEdit ? 'sm:grid-cols-3' : 'sm:grid-cols-2'} mt-6 sm:grid sm:grid-flow-row-dense sm:gap-3`}>
                    {isEdit && (
                        <button type="button" onClick={handleDelete} disabled={loading} className="inline-flex w-full justify-center items-center rounded-md border border-red-700/50 bg-red-900/20 px-4 py-2 text-base font-medium text-red-400 shadow-sm hover:bg-red-900/40 focus:outline-none sm:col-start-3 sm:text-sm disabled:opacity-50">
                            <Trash2 className="w-4 h-4 mr-2" />
                            Удалить
                        </button>
                    )}
                    <button type="submit" disabled={loading} className="inline-flex w-full justify-center rounded-md border border-transparent bg-indigo-600 px-4 py-2 text-base font-medium text-white shadow-sm hover:bg-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500 sm:col-start-2 sm:text-sm disabled:opacity-50">
                        {isEdit ? 'Сохранить' : 'Создать'}
                    </button>
                    <button type="button" onClick={onClose} className={`mt-3 inline-flex w-full justify-center rounded-md bg-gray-200 dark:bg-gray-700 px-4 py-2 text-base font-medium text-gray-800 dark:text-gray-200 hover:bg-gray-300 dark:hover:bg-gray-600 ${isEdit ? 'sm:col-start-1' : 'sm:col-start-1'} sm:mt-0 sm:text-sm transition-colors`}>
                        Отмена
                    </button>
                </div>
            </form>
        </div>
    );
}
