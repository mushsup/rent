import { useEffect, useRef, useState, type KeyboardEvent } from 'react';
import { AlertTriangle, ChevronDown, Wrench } from 'lucide-react';
import type { Bike } from '../../types';
import { BIKE_STATUS_LABELS } from '../../features/bikes/status';
import { StatusBadge, type StatusTone } from '../../shared/ui';
import { useI18n } from '../../i18n';

const STATUS_TONES: Record<string, StatusTone> = {
    available: 'lime',
    in_rent: 'slate',
    maintenance: 'amber',
};

const DOT_STYLES: Record<string, string> = {
    available: 'bg-lime-500',
    in_rent: 'bg-slate-400',
    maintenance: 'bg-orange-500'
};

function BikeStatusBadge({ status }: { status: string | null | undefined }) {
    const { t } = useI18n();
    const key = status || 'available';

    return (
        <StatusBadge tone={STATUS_TONES[key] || 'slate'} className="whitespace-nowrap px-1.5 py-1 text-[10px]">
            <span className={`h-2 w-2 rounded-full ${DOT_STYLES[key] || DOT_STYLES.available}`} aria-hidden="true" />
            {BIKE_STATUS_LABELS[key as keyof typeof BIKE_STATUS_LABELS] ? t(BIKE_STATUS_LABELS[key as keyof typeof BIKE_STATUS_LABELS]) : t('Статус неизвестен')}
        </StatusBadge>
    );
}

interface TenantBikeSelectorProps {
    bikes: Bike[];
    selectedBikeId: string;
    currentBikeId?: string;
    onChange: (bikeId: string) => void;
    disabled?: boolean;
}

export function TenantBikeSelector({ bikes, selectedBikeId, currentBikeId = '', onChange, disabled = false }: TenantBikeSelectorProps) {
    const { t } = useI18n();
    const [isOpen, setIsOpen] = useState(false);
    const [activeIndex, setActiveIndex] = useState(0);
    const containerRef = useRef<HTMLDivElement>(null);
    const selectedBike = bikes.find(bike => bike.id === selectedBikeId);
    const options = [
        { id: '', label: t('Нет велосипеда'), bike: null as Bike | null, selectable: true },
        ...bikes.filter(bike => bike.id).map(bike => ({
            id: bike.id!,
            label: `${bike.model}${bike.status === 'in_rent' && bike.assigned_tenant_name ? ` · ${bike.assigned_tenant_name}` : ''}`,
            bike,
            selectable: bike.status !== 'maintenance',
        })),
    ];
    const reassignedFrom = selectedBike?.status === 'in_rent' && selectedBike.id !== currentBikeId
        ? selectedBike.assigned_tenant_name || t('другим арендатором')
        : null;

    useEffect(() => {
        if (!isOpen) return;
        const closeOnOutsideClick = (event: MouseEvent) => {
            if (!containerRef.current?.contains(event.target as Node)) setIsOpen(false);
        };
        document.addEventListener('mousedown', closeOnOutsideClick);
        return () => document.removeEventListener('mousedown', closeOnOutsideClick);
    }, [isOpen]);

    const openList = () => {
        const selectedIndex = options.findIndex(option => option.id === selectedBikeId);
        setActiveIndex(selectedIndex >= 0 ? selectedIndex : 0);
        setIsOpen(true);
    };

    const selectBike = (bikeId: string) => {
        const option = options.find(candidate => candidate.id === bikeId);
        if (!option?.selectable) return;
        onChange(bikeId);
        setIsOpen(false);
    };

    const moveActive = (direction: 1 | -1) => {
        if (options.length === 0) return;
        let index = activeIndex;
        for (let attempt = 0; attempt < options.length; attempt += 1) {
            index = (index + direction + options.length) % options.length;
            if (options[index].selectable) {
                setActiveIndex(index);
                return;
            }
        }
    };

    const handleButtonKeyDown = (event: KeyboardEvent<HTMLButtonElement>) => {
        if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
            event.preventDefault();
            openList();
            return;
        }
        if (event.key === 'Escape') setIsOpen(false);
    };

    const handleListKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
        if (event.key === 'ArrowDown') {
            event.preventDefault();
            moveActive(1);
        } else if (event.key === 'ArrowUp') {
            event.preventDefault();
            moveActive(-1);
        } else if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault();
            const option = options[activeIndex];
            if (option) selectBike(option.id);
        } else if (event.key === 'Escape') {
            event.preventDefault();
            setIsOpen(false);
        }
    };

    return (
        <div className="relative mt-1" ref={containerRef}>
            <button
                type="button"
                aria-label={t('Велосипед')}
                aria-haspopup="listbox"
                aria-expanded={isOpen}
                aria-controls="tenant-bike-listbox"
                onClick={() => isOpen ? setIsOpen(false) : openList()}
                onKeyDown={handleButtonKeyDown}
                disabled={disabled}
                className="flex w-full items-center justify-between rounded-md border border-slate-400 bg-slate-200 px-3 py-2 text-left text-slate-900 focus:border-lime-500 focus:ring-1 focus:ring-lime-500 disabled:cursor-not-allowed disabled:opacity-60 dark:border-slate-600 dark:bg-slate-700 dark:text-white sm:text-sm"
            >
                <span className="truncate">{selectedBike?.model || t('Нет велосипеда')}</span>
                <ChevronDown className={`ml-2 h-4 w-4 flex-shrink-0 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
            </button>
            {reassignedFrom && (
                <p className="mt-1 flex items-start gap-1.5 text-xs text-amber-700 dark:text-amber-400">
                    <AlertTriangle className="mt-0.5 h-3.5 w-3.5 flex-shrink-0" aria-hidden="true" />
                    <span>{t('Велосипед занят: {{name}}. После сохранения у этого арендатора не останется велосипеда.', { name: reassignedFrom })}</span>
                </p>
            )}
            {isOpen && (
                <div id="tenant-bike-listbox" className="absolute left-0 right-0 z-30 mt-1 max-h-64 overflow-y-auto rounded-md border border-slate-400 bg-white p-1 shadow-xl dark:border-slate-600 dark:bg-slate-900" role="listbox" aria-label={t('Велосипед')} onKeyDown={handleListKeyDown} tabIndex={-1}>
                    {options.map((option, index) => (
                        <button
                            key={option.id || 'none'}
                            id={`tenant-bike-option-${index}`}
                            type="button"
                            role="option"
                            aria-selected={option.id === selectedBikeId}
                            aria-disabled={!option.selectable || undefined}
                            tabIndex={-1}
                            onMouseEnter={() => { if (option.selectable) setActiveIndex(index); }}
                            onClick={() => selectBike(option.id)}
                            className={`flex w-full items-center justify-between gap-3 rounded px-3 py-2 text-left text-sm ${index === activeIndex && option.selectable ? 'bg-lime-100 dark:bg-lime-900/30' : ''} ${option.selectable ? 'text-slate-900 hover:bg-slate-100 dark:text-white dark:hover:bg-slate-700' : 'cursor-not-allowed text-slate-400 opacity-60 dark:text-slate-500'}`}
                        >
                            <span className="min-w-0 truncate">{option.label}</span>
                            {option.bike ? <BikeStatusBadge status={option.bike.status} /> : null}
                            {option.bike?.status === 'maintenance' ? <Wrench className="h-3.5 w-3.5 shrink-0" aria-hidden="true" /> : null}
                        </button>
                    ))}
                </div>
            )}
        </div>
    );
}
