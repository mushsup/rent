import { describe, expect, it } from 'vitest';
import { buildPaymentLedger, getTenantWeeklyPayment } from './paymentLedger';
import type { Tenant } from '../types';

const tenant: Tenant = {
    id: 'tenant-1',
    bike_id: 'bike-1',
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

    it('marks the current expected charge as paid when it is fully covered', () => {
        const ledger = buildPaymentLedger(tenant, [{ amount: 100, payment_date: '2026-07-20' }], '2026-07-20');
        const currentCharge = ledger.entries.find(entry => entry.type === 'expected');

        expect(currentCharge?.isCurrentExpected).toBe(true);
        expect(currentCharge?.remainingAmount).toBe(0);
        expect(ledger.outstandingCharges).toHaveLength(0);
    });

    it('keeps rental changes in the ledger without changing the balance', () => {
        const ledger = buildPaymentLedger({
            ...tenant,
            rental_events: [{
                id: 'event-1',
                event_type: 'battery_changed',
                effective_date: '2026-07-21',
                weekly_payment: 100,
                discount_amount: 10,
                battery_config: '20',
                reason: 'Battery upgrade',
            }],
        }, [], '2026-07-22');

        const event = ledger.entries.find(entry => entry.type === 'rental_event');
        expect(event?.signedAmount).toBe(0);
        expect(event?.rentalEvent?.battery_config).toBe('20');
        expect(ledger.balanceAtReference).toBe(100);
    });

    it('does not apply the persistent discount twice to a persisted charge', () => {
        const ledger = buildPaymentLedger({
            ...tenant,
            discount_amount: 20,
            next_payment_amount: 80,
            payment_charges: [{
                id: 'charge-1',
                due_date: '2026-07-20',
                amount: 80,
                status: 'open',
                is_automatic: true,
            }],
        }, [], '2026-07-22');

        expect(ledger.outstandingCharges[0].remaining).toBe(80);
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

    it('does not invent recurring charges after the bike is released', () => {
        const ledger = buildPaymentLedger({
            ...tenant,
            bike_id: null,
            next_payment_date: null,
            payment_charges: []
        }, [], '2026-07-22');

        expect(ledger.entries).toEqual([]);
        expect(ledger.balanceAtReference).toBe(0);
    });

    it('shows how a partial payment is allocated to a rental period', () => {
        const ledger = buildPaymentLedger({
            ...tenant,
            bike_id: 'bike-1',
            payment_charges: [{
                id: 'charge-1',
                due_date: '2026-07-20',
                period_start: '2026-07-14',
                period_end: '2026-07-20',
                amount: 100
            }]
        }, [{ id: 'payment-1', amount: 40, payment_date: '2026-07-21' }], '2026-07-22');

        const charge = ledger.entries.find(entry => entry.type === 'expected');
        const payment = ledger.entries.find(entry => entry.type === 'payment');

        expect(charge?.remainingAmount).toBe(60);
        expect(payment?.allocatedAmount).toBe(40);
        expect(payment?.allocations).toEqual([expect.objectContaining({
            chargeId: 'charge-1',
            periodStart: '2026-07-14',
            periodEnd: '2026-07-20',
            amount: 40
        })]);
    });

    it('reports the number of days between actual payments', () => {
        const ledger = buildPaymentLedger({
            ...tenant,
            bike_id: 'bike-1'
        }, [
            { id: 'payment-1', amount: 25, payment_date: '2026-07-14' },
            { id: 'payment-2', amount: 25, payment_date: '2026-07-21' }
        ], '2026-07-22');

        const latest = ledger.entries.find(entry => entry.paymentId === 'payment-2');
        expect(latest?.daysSincePreviousPayment).toBe(7);
    });

    it('allocates payments against the opening balance before later charges', () => {
        const ledger = buildPaymentLedger({
            ...tenant,
            accounting_start_date: '2026-07-20',
            opening_balance: 100,
            payment_charges: [{
                id: 'charge-1',
                due_date: '2026-07-20',
                period_start: '2026-07-20',
                period_end: '2026-07-26',
                amount: 100
            }]
        }, [{ id: 'payment-1', amount: 100, payment_date: '2026-07-21' }], '2026-07-22');

        expect(ledger.outstandingCharges).toEqual([
            expect.objectContaining({ chargeId: 'charge-1', remaining: 100 })
        ]);
        expect(ledger.balanceAtReference).toBe(100);
    });

    it('connects an advance payment to the later covered period', () => {
        const ledger = buildPaymentLedger({
            ...tenant,
            bike_id: 'bike-1',
            payment_charges: [{
                id: 'charge-1',
                due_date: '2026-07-20',
                period_start: '2026-07-14',
                period_end: '2026-07-20',
                amount: 100
            }]
        }, [{ id: 'payment-1', amount: 100, payment_date: '2026-07-18' }], '2026-07-22');

        const payment = ledger.entries.find(entry => entry.paymentId === 'payment-1');
        expect(payment?.unallocatedAmount).toBe(0);
        expect(payment?.allocations[0]).toMatchObject({
            chargeId: 'charge-1',
            periodStart: '2026-07-14',
            periodEnd: '2026-07-20',
            amount: 100
        });
    });
});
