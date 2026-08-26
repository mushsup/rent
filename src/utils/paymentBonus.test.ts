import { describe, expect, it } from 'vitest';
import { calculatePaymentBonus } from './paymentBonus';

describe('payment bonus', () => {
    const tenant = { weekly_payment: 100, next_payment_date: '2026-07-27', accounting_start_date: '2026-07-01' };
    const charges = [
        { due_date: '2026-07-06', amount: 100 },
        { due_date: '2026-07-13', amount: 100 },
        { due_date: '2026-07-20', amount: 100 },
        { due_date: '2026-07-27', amount: 100 },
    ];

    it('builds a four-week streak and caps the reward at 20 zł', () => {
        const result = calculatePaymentBonus(tenant, [
            { payment_date: '2026-07-05', amount: 100 },
            { payment_date: '2026-07-12', amount: 100 },
            { payment_date: '2026-07-19', amount: 100 },
            { payment_date: '2026-07-26', amount: 100 },
        ], charges);
        expect(result.streakWeeks).toBe(4);
        expect(result.discount).toBe(20);
    });

    it('resets the streak after a late payment', () => {
        const result = calculatePaymentBonus(tenant, [
            { payment_date: '2026-07-05', amount: 100 },
            { payment_date: '2026-07-14', amount: 100 },
        ], charges);
        expect(result.streakWeeks).toBe(0);
        expect(result.discount).toBe(0);
    });
});
