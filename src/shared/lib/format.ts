import type { Bike } from '../../types';
import { getStoredLanguage, translate } from '../../i18n/translate';

export function formatBikeLabel(bike: Pick<Bike, 'model' | 'type' | 'voice_code'> | null | undefined): string {
    const t = (key: string) => translate(getStoredLanguage(), key);
    if (!bike) return t('Велосипед не выбран');
    return [bike.model, bike.type, bike.voice_code ? `#${bike.voice_code}` : null]
        .filter(Boolean)
        .join(' · ') || t('Велосипед без названия');
}

export function formatDate(value: string | null | undefined): string {
    if (!value) return '—';
    const parsed = new Date(`${value}T00:00:00`);
    if (Number.isNaN(parsed.getTime())) return '—';
    return new Intl.DateTimeFormat(getStoredLanguage() === 'en' ? 'en-US' : 'ru-RU', { day: '2-digit', month: '2-digit', year: 'numeric' }).format(parsed);
}

/** `2026-08-23T10:00:00Z` → `23.08.26, 10:00`. Returns '—' for missing/invalid input. */
export function formatDateTime(value: string | null | undefined): string {
    if (!value) return '—';
    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) return '—';
    return new Intl.DateTimeFormat(getStoredLanguage() === 'en' ? 'en-US' : 'ru-RU', {
        day: '2-digit',
        month: '2-digit',
        year: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
    }).format(parsed);
}
