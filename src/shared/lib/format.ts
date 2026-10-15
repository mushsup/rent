import type { Bike } from '../../types';

export function formatBikeLabel(bike: Pick<Bike, 'model' | 'type' | 'voice_code'> | null | undefined): string {
    if (!bike) return 'Велосипед не выбран';
    return [bike.model, bike.type, bike.voice_code ? `#${bike.voice_code}` : null]
        .filter(Boolean)
        .join(' · ') || 'Велосипед без названия';
}

export function formatDate(value: string | null | undefined): string {
    if (!value) return '—';
    const parsed = new Date(`${value}T00:00:00`);
    if (Number.isNaN(parsed.getTime())) return '—';
    return new Intl.DateTimeFormat('ru-RU', { day: '2-digit', month: '2-digit', year: 'numeric' }).format(parsed);
}

/** `2026-08-23T10:00:00Z` → `23.08.26, 10:00`. Returns '—' for missing/invalid input. */
export function formatDateTime(value: string | null | undefined): string {
    if (!value) return '—';
    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) return '—';
    return new Intl.DateTimeFormat('ru-RU', {
        day: '2-digit',
        month: '2-digit',
        year: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
    }).format(parsed);
}
