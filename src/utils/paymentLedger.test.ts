import { describe, expect, it } from 'vitest';
import { buildPaymentLedger, getTenantWeeklyPayment } from './paymentLedger';
import type { Tenant } from '../types';

const tenant: Tenant = {
    id: 'tenant-1',
    weekly_payment: 100,
    payment_day: 1,
    next_payment_date: '2026-07-20',
    payment_charges: [
        {
            id: 'charge-1',
            due_date: '2026-07-20',
            amount: 100,
            status: 'open',
            is_automatic: true
        }
    ]
};

describe('payment ledger', () => {
    it('reports an unpaid expected charge', () => {
        const ledger = buildPaymentLedger(tenant, [], '2026-07-22');

        expect(ledger.outstandingCharges).toHaveLength(1);
        expect(ledger.outstandingCharges[0].remaining).toBe(100);
    });

    it('applies a payment to the oldest charge', () => {
        const ledger = buildPaymentLedger(tenant, [{ amount: 100, payment_date: '2026-07-21' }], '2026-07-22');

        expect(ledger.outstandingCharges).toHaveLength(0);
        expect(ledger.balanceAtReference).toBe(0);
    });

    it('applies a credit adjustment without changing the charge history', () => {
        const ledger = buildPaymentLedger({
            ...tenant,
            payment_adjustments: [{ direction: 'credit', amount: 25, adjustment_date: '2026-07-21' }]
        }, [], '2026-07-22');

        expect(ledger.outstandingCharges[0].remaining).toBe(75);
    });

    it('uses the tenant weekly payment as the single source of truth', () => {
        expect(getTenantWeeklyPayment({ weekly_payment: 125 })).toBe(125);
        expect(getTenantWeeklyPayment({ weekly_payment: 0 })).toBe(0);
    });
});
