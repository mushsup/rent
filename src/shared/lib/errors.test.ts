import { describe, expect, it } from 'vitest';
import { getErrorMessage } from './errors';

describe('getErrorMessage', () => {
    it('returns the message from an Error', () => {
        expect(getErrorMessage(new Error('Не удалось сохранить'))).toBe('Не удалось сохранить');
    });

    it('supports Supabase-like error objects', () => {
        expect(getErrorMessage({ message: 'Нарушено ограничение' })).toBe('Нарушено ограничение');
    });

    it('supports string errors', () => {
        expect(getErrorMessage('Ошибка сети')).toBe('Ошибка сети');
    });

    it('does not expose arbitrary object values', () => {
        expect(getErrorMessage({ code: 'PGRST000' })).toBe('Неизвестная ошибка');
    });
});
