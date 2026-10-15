export const BATTERY_OPTIONS = [
    { value: '13', label: '13 Ah' },
    { value: '20', label: '20 Ah' },
    { value: '13+13', label: '13 + 13 Ah' },
    { value: '20+13', label: '20 + 13 Ah' },
    { value: '20+20', label: '20 + 20 Ah' },
    { value: '25+20', label: '25 + 20 Ah' },
    { value: '25+25', label: '25 + 25 Ah' },
] as const;

export const BATTERY_CAPACITY_OPTIONS = [
    { value: '13', label: '13 Ah' },
    { value: '20', label: '20 Ah' },
    { value: '25', label: '25 Ah' },
] as const;

export interface BatteryAssignment {
    capacity: string;
    battery_id?: string | null;
    code?: string | null;
}

export function parseBatteryConfig(value: string | null | undefined): BatteryAssignment[] {
    if (!value) return [];
    try {
        const parsed = JSON.parse(value) as { batteries?: BatteryAssignment[] };
        if (Array.isArray(parsed.batteries)) return parsed.batteries.slice(0, 2).map(item => ({
            capacity: String(item.capacity || ''),
            battery_id: item.battery_id || null,
            code: item.code || null,
        })).filter(item => item.capacity);
    } catch {
        // Legacy values such as "20+13" are handled below.
    }
    return value.split('+').map(capacity => ({ capacity: capacity.trim() })).filter(item => item.capacity).slice(0, 2);
}

export function serializeBatteryConfig(assignments: BatteryAssignment[]): string {
    const batteries = assignments.filter(item => item.capacity).slice(0, 2).map(item => ({
        capacity: item.capacity,
        battery_id: item.battery_id || null,
        code: item.code || null,
    }));
    return batteries.length ? JSON.stringify({ batteries }) : '';
}

const MTB_PRICES: Record<string, number> = { '13': 143, '20': 160, '13+13': 175, '20+13': 193, '20+20': 210, '25+20': 223, '25+25': 235 };
const FATBIKE_PRICES: Record<string, number> = { '13': 158, '20': 175, '13+13': 190, '20+13': 208, '20+20': 225, '25+20': 238, '25+25': 250 };

export function normalizeBikeType(type: string | null | undefined): 'mtb' | 'fatbike' {
    return String(type || '').toLowerCase().replace(/\s+/g, '').includes('fat') ? 'fatbike' : 'mtb';
}
export function getRecommendedWeeklyPrice(type: string | null | undefined, batteryConfig: string | null | undefined): number | null {
    if (!batteryConfig) return null;
    const prices = normalizeBikeType(type) === 'fatbike' ? FATBIKE_PRICES : MTB_PRICES;
    const legacyOrKey = parseBatteryConfig(batteryConfig).map(item => item.capacity).join('+');
    return prices[legacyOrKey] ?? null;
}

export function getBatteryLabel(value: string | null | undefined): string {
    const assignments = parseBatteryConfig(value);
    if (!assignments.length) return 'Не выбрана';
    return assignments.map(item => `${item.capacity} Ah${item.code ? ` · #${item.code}` : ''}`).join(' + ');
}
