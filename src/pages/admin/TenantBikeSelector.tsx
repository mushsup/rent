import { useState } from 'react';
import { ChevronDown } from 'lucide-react';
import type { Bike } from '../../types';
import { BIKE_STATUS_LABELS } from '../../features/bikes/status';

const STATUS_STYLES: Record<string, string> = {
    available: 'border-slate-300 dark:border-slate-600 bg-slate-100/70 dark:bg-slate-900/70 text-slate-500 dark:text-slate-400',
    in_rent: 'border-green-200/30 dark:border-green-800/30 bg-green-100/30 dark:bg-green-900/20 text-green-600 dark:text-green-400',
    maintenance: 'border-orange-200/30 dark:border-orange-800/30 bg-orange-100/30 dark:bg-orange-900/20 text-orange-600 dark:text-orange-400'
};

const DOT_STYLES: Record<string, string> = {
    available: 'bg-slate-400',
    in_rent: 'bg-green-500',
    maintenance: 'bg-orange-500'
};

function BikeStatusBadge({ status }: { status: string | null | undefined }) {
    const key = status || 'available';

    return (
        <span className={`inline-flex items-center gap-1 whitespace-nowrap rounded-md border px-1.5 py-1 text-[10px] font-bold uppercase tracking-wide ${STATUS_STYLES[key] || STATUS_STYLES.available}`}>
            <span className={`h-2 w-2 rounded-full ${DOT_STYLES[key] || DOT_STYLES.available}`} aria-hidden="true" />
            {BIKE_STATUS_LABELS[key as keyof typeof BIKE_STATUS_LABELS] || 'Статус неизвестен'}
        </span>
    );
}

interface TenantBikeSelectorProps {
    bikes: Bike[];
    selectedBikeId: string;
    onChange: (bikeId: string) => void;
}

export function TenantBikeSelector({ bikes, selectedBikeId, onChange }: TenantBikeSelectorProps) {
    const [isOpen, setIsOpen] = useState(false);
    const selectedBike = bikes.find(bike => bike.id === selectedBikeId);

    const selectBike = (bikeId: string) => {
        onChange(bikeId);
        setIsOpen(false);
    };

    return (
        <div className="relative mt-1">
            <button
                type="button"
                aria-label="Велосипед"
                aria-haspopup="listbox"
                aria-expanded={isOpen}
                onClick={() => setIsOpen(current => !current)}
                className="flex w-full items-center justify-between rounded-md border border-slate-400 bg-slate-200 px-3 py-2 text-left text-slate-900 focus:border-lime-500 focus:ring-1 focus:ring-lime-500 dark:border-slate-600 dark:bg-slate-700 dark:text-white sm:text-sm"
            >
                <span className="truncate">{selectedBike?.model || 'Нет велосипеда'}</span>
                <ChevronDown className={`ml-2 h-4 w-4 flex-shrink-0 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
            </button>
            {isOpen && (
                <div className="absolute left-0 right-0 z-30 mt-1 max-h-64 overflow-y-auto rounded-md border border-slate-400 bg-white p-1 shadow-xl dark:border-slate-600 dark:bg-slate-900" role="listbox">
                    <button type="button" role="option" aria-selected={!selectedBikeId} onClick={() => selectBike('')} className="flex w-full rounded px-3 py-2 text-left text-sm text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-700">
                        Нет велосипеда
                    </button>
                    {bikes.map(bike => bike.id ? (
                        <button key={bike.id} type="button" role="option" aria-selected={bike.id === selectedBikeId} onClick={() => selectBike(bike.id!)} className="flex w-full items-center justify-between gap-3 rounded px-3 py-2 text-left text-sm text-slate-900 hover:bg-slate-100 dark:text-white dark:hover:bg-slate-700">
                            <span className="min-w-0 truncate">{bike.model}{bike.status === 'in_rent' && bike.assigned_tenant_name ? ` · ${bike.assigned_tenant_name}` : ''}</span>
                            <BikeStatusBadge status={bike.status} />
                        </button>
                    ) : null)}
                </div>
            )}
        </div>
    );
}
