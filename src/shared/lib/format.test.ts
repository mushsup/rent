import { describe, expect, it } from 'vitest';
import { formatDate, formatDateTime } from './format';
import { formatEur, formatZl } from './money';
import { formatRussianDate, formatRussianShortDate } from '../../utils/russianDate';

describe('formatDate', () => {
    it('formats date-only strings without timezone drift', () => {
        expect(formatDate('2026-07-27')).toBe('27.07.2026');
    });

    it('returns a dash for missing or invalid input', () => {
        expect(formatDate(null)).toBe('—');
        expect(formatDate('')).toBe('—');
        expect(formatDate('not-a-date')).toBe('—');
    });
});

describe('formatDateTime', () => {
    it('formats timestamps with hours and minutes', () => {
        expect(formatDateTime('2026-08-23T10:00:00Z')).toContain('23.08.26');
    });

    it('returns a dash for missing or invalid input', () => {
        expect(formatDateTime(null)).toBe('—');
        expect(formatDateTime('garbage')).toBe('—');
    });
});

describe('formatZl', () => {
    it('rounds float dust and groups thousands', () => {
        expect(formatZl(0.1 + 0.2)).toBe('0,3 zł');
        expect(formatZl(1234)).toMatch(/^1.*234 zł$/);
    });

    it('treats non-numeric input as zero', () => {
        expect(formatZl(null)).toBe('0 zł');
        expect(formatZl('abc')).toBe('0 zł');
    });
});

describe('formatEur', () => {
    it('always shows two fraction digits', () => {
        expect(formatEur(100)).toContain('100,00');
    });
});

describe('russianDate', () => {
    it('formats short dates', () => {
        expect(formatRussianShortDate(new Date(2026, 0, 5))).toBe('05.01.26');
        expect(formatRussianDate(new Date(2026, 0, 5), 'LLL')).toBe('янв.');
    });

    it('returns a dash for invalid dates instead of NaN', () => {
        expect(formatRussianShortDate(new Date('garbage'))).toBe('—');
        expect(formatRussianDate(new Date('garbage'), 'LLL')).toBe('—');
    });
});
