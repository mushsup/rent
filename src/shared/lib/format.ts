import type { Bike } from '../../types';

export function formatBikeLabel(bike: Pick<Bike, 'model' | 'type' | 'voice_code'> | null | undefined): string {
    if (!bike) return 'Велосипед не выбран';
    return [bike.model, bike.type, bike.voice_code ? `#${bike.voice_code}` : null]
        .filter(Boolean)
        .join(' · ') || 'Велосипед без названия';
}

export function formatDate(value: string | null | undefined): string {
    if (!value) return '—';
    return new Intl.DateTimeFormat('ru-RU', { day: '2-digit', month: '2-digit', year: 'numeric' }).format(new Date(`${value}T00:00:00`));
}
