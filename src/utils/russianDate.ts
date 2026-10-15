const SHORT_MONTHS = ['янв.', 'февр.', 'март', 'апр.', 'май', 'июнь', 'июль', 'авг.', 'сент.', 'окт.', 'нояб.', 'дек.'];

const pad = (value: number) => String(value).padStart(2, '0');

function isValidDate(date: Date): date is Date {
    return date instanceof Date && !Number.isNaN(date.getTime());
}

/** Formats the small set of Russian date labels used by the UI without bundling date-fns/locale. */
export function formatRussianDate(date: Date, pattern: string): string {
    if (!isValidDate(date)) return '—';
    const month = SHORT_MONTHS[date.getMonth()];
    const day = date.getDate();
    const year = date.getFullYear();

    switch (pattern) {
        case 'LLL':
            return month;
        case 'MMM yyyy':
            return `${month} ${year}`;
        case 'dd MMM yyyy':
            return `${pad(day)} ${month} ${year}`;
        case 'dd MMM':
            return `${pad(day)} ${month}`;
        case 'd MMM':
            return `${day} ${month}`;
        default:
            return `${year}-${pad(date.getMonth() + 1)}-${pad(day)}`;
    }
}

export function formatRussianShortDate(date: Date): string {
    if (!isValidDate(date)) return '—';
    return `${pad(date.getDate())}.${pad(date.getMonth() + 1)}.${String(date.getFullYear()).slice(-2)}`;
}
