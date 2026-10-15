import { describe, expect, it } from 'vitest';
import {
    getBatteryLabel,
    getRecommendedWeeklyPrice,
    normalizeBikeType,
    parseBatteryConfig,
    serializeBatteryConfig,
} from './rentalPricing';

describe('parseBatteryConfig', () => {
    it('returns an empty list for missing config', () => {
        expect(parseBatteryConfig(null)).toEqual([]);
        expect(parseBatteryConfig('')).toEqual([]);
    });

    it('supports the legacy plus-separated format', () => {
        expect(parseBatteryConfig('20+13')).toEqual([{ capacity: '20' }, { capacity: '13' }]);
        expect(parseBatteryConfig(' 20 + 13 ')).toEqual([{ capacity: '20' }, { capacity: '13' }]);
    });

    it('parses the JSON format and caps at two batteries', () => {
        expect(parseBatteryConfig('{"batteries":[{"capacity":"20","battery_id":"a","code":"101"},{"capacity":"13"},{"capacity":"25"}]}')).toEqual([
            { capacity: '20', battery_id: 'a', code: '101' },
            { capacity: '13', battery_id: null, code: null },
        ]);
    });

    it('falls back to plus-splitting on invalid JSON', () => {
        expect(parseBatteryConfig('foo+bar')).toEqual([{ capacity: 'foo' }, { capacity: 'bar' }]);
    });
});

describe('serializeBatteryConfig', () => {
    it('serializes to an empty string when nothing is assigned', () => {
        expect(serializeBatteryConfig([])).toBe('');
        expect(serializeBatteryConfig([{ capacity: '' }])).toBe('');
    });

    it('round-trips through parse', () => {
        const assignments = [{ capacity: '20', battery_id: 'a', code: '101' }];
        expect(parseBatteryConfig(serializeBatteryConfig(assignments))).toEqual(assignments);
    });
});

describe('normalizeBikeType', () => {
    it('normalizes fat variants and defaults to mtb', () => {
        expect(normalizeBikeType('Fat Bike')).toBe('fatbike');
        expect(normalizeBikeType('MTB ')).toBe('mtb');
        expect(normalizeBikeType(null)).toBe('mtb');
    });
});

describe('getRecommendedWeeklyPrice', () => {
    it('prices legacy and JSON configs identically', () => {
        expect(getRecommendedWeeklyPrice('mtb', '20+13')).toBe(193);
        expect(getRecommendedWeeklyPrice('fatbike', '20+13')).toBe(208);
        expect(getRecommendedWeeklyPrice('mtb', '{"batteries":[{"capacity":"20"},{"capacity":"13"}]}')).toBe(193);
    });

    it('returns null for unknown configs', () => {
        expect(getRecommendedWeeklyPrice('mtb', '99')).toBeNull();
        expect(getRecommendedWeeklyPrice('mtb', null)).toBeNull();
    });
});

describe('getBatteryLabel', () => {
    it('labels missing config', () => {
        expect(getBatteryLabel(null)).toBe('Не выбрана');
    });

    it('includes the inventory code when assigned', () => {
        expect(getBatteryLabel('{"batteries":[{"capacity":"20","code":"101"}]}')).toBe('20 Ah · #101');
        expect(getBatteryLabel('20+13')).toBe('20 Ah + 13 Ah');
    });
});
