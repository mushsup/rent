import { formatZlotyParts } from './formatNumber';

/** Whole-zloty display used across statements and dashboards: `1 234 zł`. */
export function formatZl(value: number | string | null | undefined, fractionDigits = 0): string {
    return `${formatZlotyParts(value, fractionDigits)} zł`;
}

/** Euro display used for credits: `€1 234,50`. */
export function formatEur(value: number | string | null | undefined): string {
    const amount = Number(value);
    const safe = Number.isFinite(amount) ? amount : 0;
    return `€${safe.toLocaleString('ru-RU', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}
