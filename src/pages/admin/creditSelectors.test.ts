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

    it('returns no points without credits', () => {
        expect(buildCreditDebtChartData([], transactions, new Date('2026-03-15'))).toEqual([]);
    });

    it('grows an interest-bearing chart month over month', () => {
        const loan = { ...credit, type: 'interest', interest_rate: 36.5 } as Credit;
        const points = buildCreditDebtChartData([loan], [], new Date('2026-03-15'));

        expect(points.map(point => point.debtAmount)).toEqual([0, expect.any(Number), expect.any(Number)]);
        expect(points[2].debtAmount).toBeGreaterThan(points[1].debtAmount);
        expect(points[1].debtAmount).toBeGreaterThan(1000);
    });

    it('ignores transactions of other credits', () => {
        const foreign: CreditTransaction[] = [
            ...transactions,
            { id: 'foreign', credit_id: 'credit-9', type: 'payment', amount: 5000, transaction_date: '2026-02-10' },
        ];
        expect(getCreditDebt(credit, foreign, new Date('2026-03-15'))).toBe(850);
    });
});
