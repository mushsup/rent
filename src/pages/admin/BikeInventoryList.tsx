import { ArrowUpDown } from 'lucide-react';
import type { Bike, BikeStatus } from '../../types';
import { BIKE_STATUS_LABELS } from '../../features/bikes/status';
import { StatusBadge, type StatusTone } from '../../shared/ui';
import { useI18n } from '../../i18n';

export type BikeSortField = 'model' | 'status' | 'type';

interface BikeInventoryListProps {
    bikes: Bike[];
    onSort: (field: BikeSortField) => void;
    onSelect: (bikeId: string) => void;
    sortBy?: BikeSortField;
    sortOrder?: 'asc' | 'desc';
}

const statusTones: Record<BikeStatus, StatusTone> = {
    available: 'lime',
    in_rent: 'slate',
    maintenance: 'amber',
};

function StatusBadgeView({ status, compact = false }: { status: BikeStatus | null | undefined; compact?: boolean }) {
    const { t } = useI18n();
    const safeStatus = status || 'available';
    return <StatusBadge tone={statusTones[safeStatus]} className={compact ? 'px-1.5 py-0.5 text-[10px]' : 'px-2.5 py-1 text-[11px]'}>
        {t(BIKE_STATUS_LABELS[safeStatus])}
    </StatusBadge>;
}

export function BikeInventoryList({ bikes, onSort, onSelect, sortBy, sortOrder }: BikeInventoryListProps) {
    const { t } = useI18n();
    return <div className="overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900">
        <div className="block divide-y divide-slate-100 dark:divide-slate-700/50 sm:hidden">
            {bikes.map((bike) => {
                return <button key={bike.id} type="button" onClick={() => bike.id && onSelect(bike.id)} className="block w-full cursor-pointer p-3 text-left transition-colors hover:bg-black/5 dark:hover:bg-white/10">
                    <div className="mb-1.5 flex items-start justify-between">
                        <div className="flex min-w-0 flex-1 items-center gap-2 pr-2">
                            <div className="truncate text-sm font-bold uppercase tracking-tight text-slate-900 dark:text-white">{bike.model}</div>
                            <span className="rounded bg-lime-100 px-1.5 py-0.5 text-[10px] font-bold text-lime-950 dark:bg-lime-900/20 dark:text-lime-400">{bike.voice_code}</span>
                            {bike.assigned_tenant_name && <span className="truncate text-[11px] font-medium text-slate-400 dark:text-white/50">{bike.assigned_tenant_name}</span>}
                        </div>
                    </div>
                    <div className="flex items-center gap-2">
                        <StatusBadgeView status={bike.status} compact />
                        <span className="text-[10px] font-bold uppercase tracking-widest text-slate-500 dark:text-slate-400">{bike.type}</span>
                    </div>
                </button>;
            })}
        </div>

        <div className="hidden overflow-x-auto sm:block">
            <table className="min-w-full divide-y divide-slate-200 dark:divide-slate-700">
                <thead className="bg-white dark:bg-slate-900/50">
                    <tr>
                        {(['model', 'type', 'status'] as const).map((field) => <th key={field} scope="col" aria-sort={sortBy === field ? (sortOrder === 'asc' ? 'ascending' : 'descending') : 'none'} className="px-2 py-2 text-left text-xs font-semibold uppercase tracking-wide text-slate-600 dark:text-slate-300">
                            <button type="button" onClick={() => onSort(field)} className="inline-flex items-center gap-1 rounded-md px-4 py-2 transition-colors hover:text-lime-800 dark:hover:text-lime-400">{field === 'model' ? t('Модель') : field === 'type' ? t('Тип') : t('Статус')} <ArrowUpDown className="h-3 w-3" aria-hidden="true" /></button>
                        </th>)}
                        <th scope="col" className="relative px-6 py-4"><span className="sr-only">{t('Действия')}</span></th>
                    </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-700/50">
                    {bikes.map((bike) => {
                        return <tr key={bike.id} onClick={() => bike.id && onSelect(bike.id)} className="cursor-pointer transition-colors hover:bg-black/5 dark:hover:bg-white/10">
                            <td className="whitespace-nowrap px-6 py-4"><div className="flex items-center gap-3"><div className="text-sm font-semibold text-slate-950 dark:text-white">{bike.model}</div><span className="rounded bg-lime-100 px-2 py-0.5 text-[11px] font-bold text-lime-950 dark:bg-lime-900/20 dark:text-lime-400">{bike.voice_code}</span>{bike.assigned_tenant_name && <span className="text-sm font-normal text-slate-400 dark:text-white/50">{bike.assigned_tenant_name}</span>}</div></td>
                            <td className="whitespace-nowrap px-6 py-4"><div className="text-xs uppercase tracking-widest text-slate-500 dark:text-slate-400">{bike.type}</div></td>
                            <td className="whitespace-nowrap px-6 py-4 text-sm"><StatusBadgeView status={bike.status} /></td>
                            <td className="px-6 py-4" />
                        </tr>;
                    })}
                </tbody>
            </table>
        </div>

        {bikes.length === 0 && <div className="px-6 py-8 text-center text-sm text-slate-500 dark:text-slate-400">{t('Велосипеды не найдены. Добавьте свой первый велосипед!')}</div>}
    </div>;
}
