import { ArrowUpDown } from 'lucide-react';
import type { Bike, BikeStatus } from '../../types';
import type { BikeTenant } from '../../features/bikes/api';
import { BIKE_STATUS_LABELS } from '../../features/bikes/status';

export type BikeSortField = 'model' | 'status' | 'type';

interface BikeInventoryListProps {
    bikes: Bike[];
    tenants: BikeTenant[];
    onSort: (field: BikeSortField) => void;
    onSelect: (bikeId: string) => void;
}

const statusClasses: Record<BikeStatus, string> = {
    available: 'border-slate-200 bg-slate-100/50 text-slate-500 dark:border-slate-800 dark:bg-slate-900/40 dark:text-slate-400',
    in_rent: 'border-green-200/30 bg-green-100/30 text-green-600 dark:border-green-800/30 dark:bg-green-900/20 dark:text-green-400',
    maintenance: 'border-orange-200/30 bg-orange-100/30 text-orange-600 dark:border-orange-800/30 dark:bg-orange-900/20 dark:text-orange-400',
};

function StatusBadge({ status, compact = false }: { status: BikeStatus | null | undefined; compact?: boolean }) {
    const safeStatus = status || 'available';
    return <span className={`inline-flex rounded-md border font-bold uppercase tracking-wide ${compact ? 'px-1.5 py-0.5 text-[10px]' : 'px-2.5 py-1 text-[11px]'} ${statusClasses[safeStatus]}`}>
        {BIKE_STATUS_LABELS[safeStatus]}
    </span>;
}

function tenantForBike(tenants: BikeTenant[], bikeId: string | undefined): BikeTenant | undefined {
    return bikeId ? tenants.find((tenant) => tenant.bike_id === bikeId) : undefined;
}

export function BikeInventoryList({ bikes, tenants, onSort, onSelect }: BikeInventoryListProps) {
    return <div className="overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900">
        <div className="block divide-y divide-slate-100 dark:divide-slate-700/50 sm:hidden">
            {bikes.map((bike) => {
                const tenant = tenantForBike(tenants, bike.id);
                return <button key={bike.id} type="button" onClick={() => bike.id && onSelect(bike.id)} className="block w-full cursor-pointer p-3 text-left transition-colors hover:bg-black/5 dark:hover:bg-white/10">
                    <div className="mb-1.5 flex items-start justify-between">
                        <div className="flex min-w-0 flex-1 items-center gap-2 pr-2">
                            <div className="truncate text-sm font-bold uppercase tracking-tight text-slate-900 dark:text-white">{bike.model}</div>
                            <span className="rounded bg-lime-100 px-1.5 py-0.5 text-[10px] font-bold text-lime-950 dark:bg-lime-900/20 dark:text-lime-400">{bike.voice_code}</span>
                            {tenant && <span className="truncate text-[11px] font-medium text-slate-400 dark:text-white/50">{tenant.name}</span>}
                        </div>
                    </div>
                    <div className="flex items-center gap-2">
                        <StatusBadge status={bike.status} compact />
                        <span className="text-[10px] font-bold uppercase tracking-widest text-slate-500 dark:text-slate-400">{bike.type}</span>
                    </div>
                </button>;
            })}
        </div>

        <div className="hidden overflow-x-auto sm:block">
            <table className="min-w-full divide-y divide-slate-200 dark:divide-slate-700">
                <thead className="bg-white dark:bg-slate-900/50">
                    <tr>
                        {(['model', 'type', 'status'] as const).map((field) => <th key={field} scope="col" className="cursor-pointer px-6 py-4 text-left text-xs font-semibold uppercase tracking-wide text-slate-600 transition-colors hover:text-lime-800 dark:text-slate-300 dark:hover:text-lime-400" onClick={() => onSort(field)}>
                            <div className="flex items-center gap-1">{field === 'model' ? 'Модель' : field === 'type' ? 'Тип' : 'Статус'} <ArrowUpDown className="h-3 w-3" /></div>
                        </th>)}
                        <th scope="col" className="relative px-6 py-4"><span className="sr-only">Действия</span></th>
                    </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-700/50">
                    {bikes.map((bike) => {
                        const tenant = tenantForBike(tenants, bike.id);
                        return <tr key={bike.id} onClick={() => bike.id && onSelect(bike.id)} className="cursor-pointer transition-colors hover:bg-black/5 dark:hover:bg-white/10">
                            <td className="whitespace-nowrap px-6 py-4"><div className="flex items-center gap-3"><div className="text-sm font-semibold text-black dark:text-white">{bike.model}</div><span className="rounded bg-lime-100 px-2 py-0.5 text-[11px] font-bold text-lime-950 dark:bg-lime-900/20 dark:text-lime-400">{bike.voice_code}</span>{tenant && <span className="text-sm font-normal text-slate-400 dark:text-white/50">{tenant.name}</span>}</div></td>
                            <td className="whitespace-nowrap px-6 py-4"><div className="text-xs uppercase tracking-widest text-slate-500 dark:text-slate-400">{bike.type}</div></td>
                            <td className="whitespace-nowrap px-6 py-4 text-sm"><StatusBadge status={bike.status} /></td>
                            <td className="px-6 py-4" />
                        </tr>;
                    })}
                </tbody>
            </table>
        </div>

        {bikes.length === 0 && <div className="px-6 py-8 text-center text-sm text-slate-500 dark:text-slate-400">Велосипеды не найдены. Добавьте свой первый велосипед!</div>}
    </div>;
}
