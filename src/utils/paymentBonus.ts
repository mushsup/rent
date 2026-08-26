import type { Payment, PaymentCharge, Tenant } from '../types';

export const BONUS_STEP = 5;
export const BONUS_MAX = 20;
export const BONUS_WEEKS_TO_MAX = BONUS_MAX / BONUS_STEP;

export interface PaymentBonus {
    streakWeeks: number;
    discount: number;
    nextPaymentAmount: number;
    isOnTrack: boolean;
}
function money(value: number): number {
    return Math.round((value + Number.EPSILON) * 100) / 100;
}

/**
 * Calculates the current reward without storing derived counters in the DB.
 * A payment is considered on time when it is applied to a charge no later
 * than that charge's due date. The latest consecutive on-time payments form
 * the streak; one late payment resets it.
 */
export function calculatePaymentBonus(
    tenant: Tenant | null | undefined,
    payments: Payment[] = [],
    charges: PaymentCharge[] = [],
): PaymentBonus {
    const weekly = Math.max(Number(tenant?.weekly_payment) || 0, 0);
    const sortedCharges = charges
        .filter(charge => charge?.due_date && charge.status !== 'waived')
        .map(charge => ({ due: charge.due_date, remaining: Math.max(Number(charge.amount) || weekly, 0) }))
        .sort((left, right) => left.due.localeCompare(right.due));
    const sortedPayments = payments
        .filter(payment => payment?.payment_date)
        .map(payment => ({ date: payment.payment_date, amount: Math.max(Number(payment.amount) || 0, 0) }))
        .sort((left, right) => left.date.localeCompare(right.date));

    let streakWeeks = 0;
    let chargeIndex = 0;
    sortedPayments.forEach(payment => {
        while (chargeIndex < sortedCharges.length && sortedCharges[chargeIndex].remaining <= 0.001) chargeIndex += 1;
        const charge = sortedCharges[chargeIndex];
        const dueDate = charge?.due || tenant?.next_payment_date || payment.date;
        const onTime = payment.date <= dueDate;
        streakWeeks = onTime ? Math.min(streakWeeks + 1, BONUS_WEEKS_TO_MAX) : 0;

        let remaining = payment.amount;
        while (remaining > 0.001 && chargeIndex < sortedCharges.length) {
            const current = sortedCharges[chargeIndex];
            const applied = Math.min(remaining, current.remaining);
            current.remaining = money(current.remaining - applied);
            remaining = money(remaining - applied);
            if (current.remaining <= 0.001) chargeIndex += 1;
        }
    });

    const discount = Math.min(streakWeeks * BONUS_STEP, BONUS_MAX);
    return {
        streakWeeks,
        discount,
        nextPaymentAmount: Math.max(money(weekly - discount), 0),
        isOnTrack: streakWeeks > 0,
    };
}
