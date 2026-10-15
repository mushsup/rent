import { describe, expect, it } from 'vitest';
import { slugify, uniqueSlug } from './slug';

describe('slugify', () => {
    it('transliterates Russian names', () => {
        expect(slugify('Иван Курьер')).toBe('ivan-kurer');
    });

    it('maps й to j and drops hard/soft signs', () => {
        expect(slugify('Подъём')).toBe('podem');
        expect(slugify('Курьер')).toBe('kurer');
    });

    it('returns an empty string for blank input', () => {
        expect(slugify('')).toBe('');
        expect(slugify('   ')).toBe('');
    });

    it('truncates to 75 characters without a trailing dash', () => {
        const long = `${'a-'.repeat(50)}end`;
        const result = slugify(long);
        expect(result.length).toBeLessThanOrEqual(75);
        expect(result.endsWith('-')).toBe(false);
    });
});

describe('uniqueSlug', () => {
    it('returns the clean base when free', () => {
        expect(uniqueSlug('Ivan', [])).toBe('ivan');
    });

    it('falls back past the reserved tenant word', () => {
        expect(uniqueSlug('', new Set())).toBe('tenant-2');
    });

    it('appends an incrementing suffix on collision', () => {
        expect(uniqueSlug('Ivan', ['ivan', 'ivan-2'])).toBe('ivan-3');
    });

    it('matches existing slugs case-insensitively', () => {
        expect(uniqueSlug('ivan', ['IVAN'])).toBe('ivan-2');
    });

    it('never shadows static client routes', () => {
        expect(uniqueSlug('Bikes', [])).toBe('bikes-2');
        expect(uniqueSlug('history', [])).toBe('history-2');
    });
});
