/** Rounds to cents first so float dust (0.1 + 0.2) never leaks into the UI. */
export function roundMoney(value: number): number {
    return Math.round((value + Number.EPSILON) * 100) / 100;
}

/** `1234.5` → `1 234,5` (ru-RU grouping, no currency suffix). */
export function formatZlotyParts(value: number | string | null | undefined, fractionDigits = 0): string {
    const amount = Number(value);
    const safe = Number.isFinite(amount) ? amount : 0;
    return roundMoney(safe).toLocaleString('ru-RU', {
        minimumFractionDigits: fractionDigits,
        maximumFractionDigits: Math.max(fractionDigits, 2),
    });
}
