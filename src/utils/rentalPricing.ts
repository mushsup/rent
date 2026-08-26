export const BATTERY_OPTIONS = [
    { value: '13', label: '13 Ah' },
    { value: '20', label: '20 Ah' },
    { value: '13+13', label: '13 + 13 Ah' },
    { value: '20+13', label: '20 + 13 Ah' },
    { value: '20+20', label: '20 + 20 Ah' },
    { value: '25+20', label: '25 + 20 Ah' },
    { value: '25+25', label: '25 + 25 Ah' },
] as const;

const MTB_PRICES: Record<string, number> = { '13': 143, '20': 160, '13+13': 175, '20+13': 193, '20+20': 210, '25+20': 223, '25+25': 235 };
const FATBIKE_PRICES: Record<string, number> = { '13': 158, '20': 175, '13+13': 190, '20+13': 208, '20+20': 225, '25+20': 238, '25+25': 250 };

export function normalizeBikeType(type: string | null | undefined): 'mtb' | 'fatbike' {
    return String(type || '').toLowerCase().replace(/\s+/g, '').includes('fat') ? 'fatbike' : 'mtb';
}
export function getRecommendedWeeklyPrice(type: string | null | undefined, batteryConfig: string | null | undefined): number | null {
    if (!batteryConfig) return null;
    const prices = normalizeBikeType(type) === 'fatbike' ? FATBIKE_PRICES : MTB_PRICES;
    return prices[batteryConfig] ?? null;
}

export function getBatteryLabel(value: string | null | undefined): string {
    return BATTERY_OPTIONS.find(option => option.value === value)?.label || value || 'Не выбрана';
}
