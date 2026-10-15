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

    it('does not include a future charge in the current balance', () => {
        const ledger = buildPaymentLedger({
            ...tenant,
            payment_charges: [
                { id: 'current-charge', due_date: '2026-08-25', amount: 100, status: 'open' },
                { id: 'future-charge', due_date: '2026-09-03', amount: 100, status: 'open' },
            ],
        }, [], '2026-08-28');

        expect(ledger.balanceAtReference).toBe(100);
        expect(ledger.currentBalance).toBe(100);
        expect(ledger.entries.find(entry => entry.charge?.id === 'future-charge')?.balance).toBe(100);
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

    it('starts a new running balance from a dated balance checkpoint', () => {
        const ledger = buildPaymentLedger({
            ...tenant,
            payment_charges: [
                { id: 'old-charge', due_date: '2026-07-20', amount: 100, status: 'open' },
                { id: 'new-charge', due_date: '2026-07-27', amount: 100, status: 'open' },
            ],
            payment_adjustments: [{
                id: 'checkpoint',
                direction: 'charge',
                amount: 0,
                balance_override: 30,
                adjustment_date: '2026-07-25',
                comment: 'Сверка',
            }],
        }, [
            { id: 'old-payment', amount: 20, payment_date: '2026-07-21' },
            { id: 'new-payment', amount: 50, payment_date: '2026-07-28' },
        ], '2026-07-29');

        expect(ledger.balanceAtReference).toBe(80);
        expect(ledger.outstandingCharges).toEqual([
            expect.objectContaining({ chargeId: 'new-charge', remaining: 80 }),
        ]);
        expect(ledger.outstandingCharges.some(charge => charge.chargeId === 'old-charge')).toBe(false);
    });

    it('can clear all previous debt with a zero balance checkpoint', () => {
        const ledger = buildPaymentLedger({
            ...tenant,
            payment_adjustments: [{
                id: 'checkpoint',
                direction: 'charge',
                amount: 0,
                balance_override: 0,
                adjustment_date: '2026-07-21',
                comment: 'Сверка',
            }],
        }, [], '2026-07-22');

        expect(ledger.balanceAtReference).toBe(0);
        expect(ledger.outstandingCharges).toHaveLength(0);
    });

    it('treats a balance checkpoint as the end-of-day reconciliation', () => {
        const ledger = buildPaymentLedger({
            ...tenant,
            payment_adjustments: [{
                id: 'checkpoint', direction: 'charge', amount: 0,
                balance_override: 100, adjustment_date: '2026-07-21', comment: 'Сверка',
            }],
        }, [{ id: 'payment', amount: 50, payment_date: '2026-07-21' }], '2026-07-22');

        expect(ledger.balanceAtReference).toBe(100);
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

    it('marks a charge overdue only the day after its due date', () => {
        const dueToday = buildPaymentLedger(tenant, [], '2026-07-20');
        const overdue = buildPaymentLedger(tenant, [], '2026-07-21');

        expect(dueToday.entries.find(entry => entry.charge?.id === 'charge-1')?.isOverdue).toBe(false);
        expect(overdue.entries.find(entry => entry.charge?.id === 'charge-1')?.isOverdue).toBe(true);
    });

    it('ignores waived charges in the outstanding debt', () => {
        const ledger = buildPaymentLedger({
            ...tenant,
            payment_charges: [{ id: 'waived', due_date: '2026-07-20', amount: 100, status: 'waived' }],
        }, [], '2026-07-22');

        expect(ledger.outstandingCharges).toHaveLength(0);
        expect(ledger.balanceAtReference).toBe(0);
    });

    it('keeps every persisted charge on a shared due date', () => {
        const ledger = buildPaymentLedger({
            ...tenant,
            payment_charges: [
                { id: 'auto', due_date: '2026-07-20', amount: 100, status: 'open' },
                { id: 'manual', due_date: '2026-07-20', amount: 50, status: 'open' },
            ],
        }, [], '2026-07-22');

        expect(ledger.outstandingCharges).toHaveLength(2);
        expect(ledger.balanceAtReference).toBe(150);
    });

    it('turns an overpayment into available credit', () => {
        const ledger = buildPaymentLedger({
            ...tenant,
            next_payment_date: '2026-07-27',
            payment_charges: [
                { id: 'first', due_date: '2026-07-20', amount: 100, status: 'open' },
                { id: 'second', due_date: '2026-07-27', amount: 100, status: 'open' },
            ],
        }, [{ id: 'big', amount: 250, payment_date: '2026-07-21' }], '2026-07-28');

        expect(ledger.outstandingCharges).toHaveLength(0);
        expect(ledger.creditAtReference).toBe(50);
    });

    it('offsets charges with a negative opening balance', () => {
        const ledger = buildPaymentLedger({
            ...tenant,
            opening_balance: -50,
            payment_charges: [],
        }, [], '2026-07-22');

        // Virtual weekly expectation of 100 minus the 50 prepayment.
        expect(ledger.balanceAtReference).toBe(50);
        expect(ledger.outstandingCharges).toHaveLength(1);
        expect(ledger.outstandingCharges[0].remaining).toBe(50);
        expect(ledger.creditAtReference).toBe(0);
    });

    it('covers a later charge with a negative balance checkpoint', () => {
        const ledger = buildPaymentLedger({
            ...tenant,
            payment_charges: [{ id: 'charge-1', due_date: '2026-07-22', amount: 100, status: 'open' }],
            payment_adjustments: [{
                id: 'checkpoint', direction: 'charge', amount: 0,
                balance_override: -30, adjustment_date: '2026-07-21', comment: 'Сверка',
            }],
        }, [], '2026-07-23');

        expect(ledger.outstandingCharges).toHaveLength(1);
        expect(ledger.outstandingCharges[0].remaining).toBe(70);
    });

    it('counts calendar days across DST transitions', () => {
        // 2026-03-29 is a 23-hour day and 2026-10-25 a 25-hour day in Europe/Warsaw.
        const ledger = buildPaymentLedger(tenant, [
            { id: 'spring', amount: 10, payment_date: '2026-03-29' },
            { id: 'spring-next', amount: 10, payment_date: '2026-03-30' },
            { id: 'autumn', amount: 10, payment_date: '2026-10-25' },
            { id: 'autumn-next', amount: 10, payment_date: '2026-10-26' },
        ], '2026-10-27');

        const days = new Map(ledger.entries.filter(entry => entry.type === 'payment')
            .map(entry => [entry.paymentId, entry.daysSincePreviousPayment]));
        expect(days.get('spring-next')).toBe(1);
        expect(days.get('autumn-next')).toBe(1);
    });

    it('treats a local-midnight Date like the matching date string', () => {
        const fromString = buildPaymentLedger(tenant, [], '2026-07-26');
        const fromDate = buildPaymentLedger(tenant, [], new Date(2026, 6, 26));

        expect(fromDate.balanceAtReference).toBe(fromString.balanceAtReference);
    });

    it('ignores the amount of rental events in the money balance', () => {
        const ledger = buildPaymentLedger({
            ...tenant,
            rental_events: [{ id: 'event-1', event_type: 'terms_changed', effective_date: '2026-07-21', weekly_payment: 100, amount: 200, reason: 'Тест' }],
        }, [], '2026-07-22');

        expect(ledger.balanceAtReference).toBe(100);
    });

    it('falls back to the reference weekday for a corrupt payment day', () => {
        // payment_day -1 is invalid: the schedule must follow the reference
        // Monday instead of drifting to Friday.
        const ledger = buildPaymentLedger({
            ...tenant,
            payment_day: -1,
            next_payment_date: null,
            payment_charges: [],
        }, [], new Date(2026, 6, 27));

        expect(ledger.entries.some(entry => entry.isCurrentExpected && entry.dateKey === '2026-07-27')).toBe(true);
    });
});
