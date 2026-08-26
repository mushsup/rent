import { describe, expect, it } from 'vitest';
import type { Credit, CreditTransaction } from '../../types';
import { buildCreditDebtChartData, getCreditDebt, getTotalCreditDebt } from './creditSelectors';

const credit: Credit = {
    id: 'credit-1',
    name: 'Test credit',
    start_date: '2026-01-10',
    type: 'no_interest',
    amount: 1000,
    payment_day: 1,
    payment_amount: 100
};

const transactions: CreditTransaction[] = [
    { id: 'payment-1', credit_id: 'credit-1', type: 'payment', amount: 250, transaction_date: '2026-02-10' },
    { id: 'addition-1', credit_id: 'credit-1', type: 'addition', amount: 100, transaction_date: '2026-03-01' }
];

describe('credit selectors', () => {
    it('calculates one credit using only its transactions', () => {
        expect(getCreditDebt(credit, transactions, new Date('2026-03-15'))).toBe(850);
    });

    it('sums current debt across credits', () => {
        const secondCredit = { ...credit, id: 'credit-2', amount: 500 };
        expect(getTotalCreditDebt([credit, secondCredit], transactions, new Date('2026-03-15'))).toBe(1350);
    });

    it('builds one chart point per month and includes the reference month', () => {
        const points = buildCreditDebtChartData([credit], transactions, new Date('2026-03-15'));

        expect(points.map(point => point.date)).toEqual(['2026-01-01', '2026-02-01', '2026-03-01']);
        expect(points.map(point => point.debtAmount)).toEqual([0, 1000, 850]);
    });
});
