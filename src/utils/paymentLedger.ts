import { addDays, format, parseISO, subDays } from 'date-fns';
import { DEFAULT_PAYMENT_DAY, getPaymentDay, getScheduledPaymentDate } from './paymentSchedule';
import type { AdjustmentLedgerEvent, ExpectedLedgerEvent, LedgerEntry, LedgerEvent, Payment, PaymentCharge, PaymentLedger, PaymentLedgerEvent, RentalLedgerEvent, Tenant } from '../types';

const HISTORY_WEEKS_WITHOUT_ANCHOR = 12;

function toDate(value: string | Date | number): Date {
    return typeof value === 'string' ? parseISO(value) : new Date(value);
}

function toDateKey(value: string | Date | number): string {
    return format(toDate(value), 'yyyy-MM-dd');
}

function compareDates(left: string | Date | number, right: string | Date | number): number {
    return toDate(left).getTime() - toDate(right).getTime();
}

function compareTimestamps(left: string | Date | number, right: string | Date | number): number {
    return new Date(left).getTime() - new Date(right).getTime();
}

function roundMoney(value: number): number {
    return Math.round((Number(value) + Number.EPSILON) * 100) / 100;
}

/** Returns the tenant's recurring weekly payment. */
export function getTenantWeeklyPayment(tenant: Tenant | null | undefined): number {
    return Math.max(Number(tenant?.weekly_payment) || 0, 0);
}

/**
 * Builds a chronological ledger of scheduled charges and actual payments.
 * @param {object} tenant Tenant with payment schedule fields.
 * @param {Array<object>} payments Actual payments linked to the tenant.
 * @param {Date|string} referenceDate Date used to determine the current balance.
 * @returns {{entries: Array<object>, currentBalance: number, balanceAtReference: number}}
 * Ledger entries and balances after all entries and after the reference date.
 */
export function buildPaymentLedger(tenant: Tenant | null | undefined, payments: Payment[] = [], referenceDate: Date | string = new Date()): PaymentLedger {
    if (!tenant) {
        return {
            entries: [],
            currentBalance: 0,
            balanceAtReference: 0,
            outstandingCharges: [],
            creditAtReference: 0
        };
    }

    const hasActiveRental = Boolean(tenant.bike_id) && !tenant.is_archived;
    const paymentDay = Number(tenant.payment_day)
        || getPaymentDay(tenant.next_payment_date || referenceDate)
        || DEFAULT_PAYMENT_DAY;
    const nextPaymentKey = tenant.next_payment_date
        ? toDateKey(tenant.next_payment_date)
        : getScheduledPaymentDate(referenceDate, paymentDay);
    const actualPayments = payments.filter(payment => payment?.payment_date);
    const persistedCharges = (tenant.payment_charges || []).filter(charge => charge?.due_date);
    const earliestPayment = actualPayments.reduce<string | null>((earliest, payment) => (
        !earliest || compareDates(payment.payment_date, earliest) < 0 ? payment.payment_date : earliest
    ), null);
    const latestPayment = actualPayments.reduce<string | null>((latest, payment) => (
        !latest || compareDates(payment.payment_date, latest) > 0 ? payment.payment_date : latest
    ), null);
    const earliestCharge = persistedCharges.reduce<PaymentCharge | null>((earliest, charge) => (
        !earliest || compareDates(charge.due_date, earliest.due_date) < 0 ? charge : earliest
    ), null);
    const referenceKey = toDateKey(referenceDate);
    // When term history is unavailable, next_payment_date is the current
    // accounting anchor; deriving charges from old payments would overstate debt.
    const startDate = tenant.accounting_start_date
        ? toDateKey(tenant.accounting_start_date)
        : tenant.created_at
        ? toDateKey(tenant.created_at)
        : earliestCharge
            ? toDateKey(earliestCharge.period_start || earliestCharge.due_date)
        : tenant.next_payment_date
            ? nextPaymentKey
            : earliestPayment
                ? toDateKey(subDays(toDate(earliestPayment), 7))
                : toDateKey(subDays(toDate(nextPaymentKey), HISTORY_WEEKS_WITHOUT_ANCHOR * 7));
    const endDate = latestPayment && (!hasActiveRental || compareDates(latestPayment, nextPaymentKey) > 0)
        ? toDateKey(latestPayment)
        : hasActiveRental
            ? nextPaymentKey
            : referenceKey;
    const terms = (tenant.payment_terms || [])
        .map(term => ({
            ...term,
            weekly_payment: Number(term.weekly_payment) || 0,
            discount_amount: Number(term.discount_amount) || 0,
            payment_day: Number(term.payment_day) || paymentDay
        }))
        .sort((left, right) => compareDates(left.effective_from, right.effective_from));
    const effectiveTerms = terms.length > 0 ? terms : [{
        weekly_payment: getTenantWeeklyPayment(tenant),
        discount_amount: Number(tenant.discount_amount) || 0,
        payment_day: paymentDay,
        effective_from: startDate,
        effective_to: null
    }];
    const adjustments = (tenant.payment_adjustments || []).filter(adjustment => adjustment?.adjustment_date);
    const chargeByDate = new Map(persistedCharges.map(charge => [toDateKey(charge.due_date), charge]));
    const expectedDates = new Set<string>();
    if (persistedCharges.length > 0) {
        persistedCharges.forEach(charge => expectedDates.add(toDateKey(charge.due_date)));
    } else if (hasActiveRental) {
        effectiveTerms.forEach(term => {
            const termStart = compareDates(term.effective_from, startDate) > 0 ? term.effective_from : startDate;
            const termEnd = term.effective_to && compareDates(term.effective_to, endDate) < 0 ? term.effective_to : endDate;
            let expectedDate = getScheduledPaymentDate(termStart, term.payment_day);
            while (compareDates(expectedDate, termEnd) <= 0) {
                expectedDates.add(expectedDate);
                expectedDate = toDateKey(addDays(toDate(expectedDate), 7));
            }
        });
    }
    // A manually moved current expected payment is still a real ledger event.
    if (hasActiveRental) expectedDates.add(nextPaymentKey);
    let hasFutureExpectedDate = false;
    const visibleExpectedDates = Array.from(expectedDates)
        .sort(compareDates)
        .filter(date => {
            if (compareDates(date, referenceKey) <= 0) return true;
            if (hasFutureExpectedDate) return false;
            hasFutureExpectedDate = true;
            return true;
        });

    const events: LedgerEvent[] = [
        ...(tenant.rental_events || []).map<RentalLedgerEvent>(event => ({
            type: 'rental_event',
            date: toDateKey(event.effective_date),
            amount: Number(event.amount) || 0,
            comment: event.reason || '',
            rentalEvent: event,
            createdAt: event.created_at || null,
            sortOrder: -1,
        })),
        ...visibleExpectedDates.map<ExpectedLedgerEvent>(date => ({ type: 'expected', date, charge: chargeByDate.get(date), sortOrder: 0 })),
        ...adjustments.map<AdjustmentLedgerEvent>(adjustment => ({
            type: 'adjustment',
            date: toDateKey(adjustment.adjustment_date),
            amount: Number(adjustment.amount) || 0,
            direction: adjustment.direction,
            comment: adjustment.comment || '',
            createdAt: adjustment.created_at || null,
            adjustmentId: adjustment.id,
            sortOrder: 1
        })),
        ...actualPayments.map<PaymentLedgerEvent>(payment => ({
            type: 'payment',
            date: toDateKey(payment.payment_date),
            amount: Number(payment.amount) || 0,
            comment: payment.comment || '',
            createdAt: payment.created_at || null,
            paymentId: payment.id,
            sortOrder: 2
        }))
    ].sort((left, right) => compareDates(left.date, right.date) || left.sortOrder - right.sortOrder);

    const expectedOverride = tenant.next_payment_amount != null ? Number(tenant.next_payment_amount) : null;
    const openingBalance = roundMoney(Number(tenant.opening_balance) || 0);
    let balance = openingBalance;
    let balanceAtReference = compareDates(referenceKey, startDate) >= 0 ? balance : 0;
    const entries: LedgerEntry[] = events.map((event: LedgerEvent) => {
        const term = event.type === 'expected'
            ? effectiveTerms.find(candidate => (
                compareDates(event.date, candidate.effective_from) >= 0
                && (!candidate.effective_to || compareDates(event.date, candidate.effective_to) <= 0)
            )) || effectiveTerms[effectiveTerms.length - 1]
            : null;
        const weeklyPayment = term?.weekly_payment ?? 0;
        const discountAmount = term?.discount_amount ?? 0;
        const amount = event.type === 'expected'
                ? (event.charge
                ? event.charge.status === 'waived' ? 0 : event.date === nextPaymentKey
                    ? Number(event.charge.amount) || 0
                    : Number(event.charge.amount) || 0
                : event.date === nextPaymentKey
                    ? Math.max(expectedOverride != null ? expectedOverride : weeklyPayment - discountAmount, 0)
                    : Math.max(weeklyPayment - discountAmount, 0))
            : event.amount;
        const createdAt = 'createdAt' in event ? event.createdAt : null;
        const wasRecordedAfterLedgerStarted = createdAt
            && earliestCharge?.created_at
            && compareTimestamps(createdAt, earliestCharge.created_at) >= 0;
        const isBeforeAccountingStart = compareDates(event.date, startDate) < 0
            && !wasRecordedAfterLedgerStarted;
        const signedAmount = isBeforeAccountingStart
            ? 0
            : event.type === 'expected'
                ? amount
                : event.type === 'adjustment'
                    ? (event.direction === 'charge' ? amount : -amount)
                    : event.type === 'payment' ? -amount : 0;
        balance = roundMoney(balance + signedAmount);
        if (compareDates(event.date, referenceKey) <= 0) balanceAtReference = balance;

        return {
            ...event,
            amount,
            signedAmount,
            balance,
            date: toDate(event.date),
            dateKey: event.date,
            isCurrentExpected: event.type === 'expected' && event.date === nextPaymentKey,
            isAutomatic: event.type === 'expected' && event.charge?.is_automatic === true,
            isOverdue: event.type === 'expected' && compareDates(event.date, referenceKey) <= 0,
            comment: event.type === 'expected'
                ? (event.charge?.comment || (event.date === nextPaymentKey ? tenant.next_payment_comment || '' : ''))
                : event.comment || '',
            rentalEvent: event.type === 'rental_event' ? event.rentalEvent : undefined,
            allocatedAmount: 0,
            remainingAmount: 0,
            unallocatedAmount: 0,
            daysSincePreviousPayment: null,
            allocations: []
        };
    });

    let availableCredit = 0;
    const chargeQueue: Array<{ entry: LedgerEntry; remaining: number }> = [];
    const creditQueue: Array<{ entry: LedgerEntry; remaining: number }> = [];
    let previousPaymentDate: string | null = null;

    if (openingBalance > 0 && compareDates(referenceKey, startDate) >= 0) {
        const openingDebtEntry: LedgerEntry = {
            type: 'expected',
            date: toDate(startDate),
            dateKey: startDate,
            amount: openingBalance,
            signedAmount: openingBalance,
            balance: openingBalance,
            isCurrentExpected: false,
            isAutomatic: false,
            isOverdue: true,
            comment: 'Opening balance',
            allocatedAmount: 0,
            remainingAmount: openingBalance,
            unallocatedAmount: 0,
            daysSincePreviousPayment: null,
            allocations: []
        };
        chargeQueue.push({ entry: openingDebtEntry, remaining: openingBalance });
    }

    entries.forEach(entry => {
        if (entry.type === 'payment') {
            entry.daysSincePreviousPayment = previousPaymentDate
                ? Math.round((toDate(entry.dateKey).getTime() - toDate(previousPaymentDate).getTime()) / 86_400_000)
                : null;
            previousPaymentDate = entry.dateKey;
        }

        if (compareDates(entry.dateKey, referenceKey) > 0 || entry.signedAmount === 0) return;

        if (entry.signedAmount > 0) {
            let remaining = roundMoney(entry.signedAmount);
            while (remaining > 0 && creditQueue.length > 0) {
                const oldestCredit = creditQueue[0];
                const appliedAmount = Math.min(remaining, oldestCredit.remaining);
                oldestCredit.remaining = roundMoney(oldestCredit.remaining - appliedAmount);
                oldestCredit.entry.allocatedAmount = roundMoney(oldestCredit.entry.allocatedAmount + appliedAmount);
                oldestCredit.entry.unallocatedAmount = oldestCredit.remaining;
                oldestCredit.entry.allocations.push({
                    chargeId: entry.charge?.id || null,
                    dateKey: entry.dateKey,
                    periodStart: entry.charge?.period_start || null,
                    periodEnd: entry.charge?.period_end || null,
                    amount: appliedAmount
                });
                entry.allocatedAmount = roundMoney(entry.allocatedAmount + appliedAmount);
                availableCredit = roundMoney(availableCredit - appliedAmount);
                remaining = roundMoney(remaining - appliedAmount);
                if (oldestCredit.remaining <= 0) creditQueue.shift();
            }
            entry.remainingAmount = remaining;

            if (remaining > 0) {
                chargeQueue.push({ entry, remaining });
            }
            return;
        }

        let creditAmount = roundMoney(Math.abs(entry.signedAmount));
        while (creditAmount > 0 && chargeQueue.length > 0) {
            const oldestCharge = chargeQueue[0];
            const appliedAmount = Math.min(creditAmount, oldestCharge.remaining);
            oldestCharge.remaining = roundMoney(oldestCharge.remaining - appliedAmount);
            oldestCharge.entry.remainingAmount = oldestCharge.remaining;
            oldestCharge.entry.allocatedAmount = roundMoney(oldestCharge.entry.allocatedAmount + appliedAmount);
            entry.allocatedAmount = roundMoney(entry.allocatedAmount + appliedAmount);
            entry.allocations.push({
                chargeId: oldestCharge.entry.charge?.id || null,
                dateKey: oldestCharge.entry.dateKey,
                periodStart: oldestCharge.entry.charge?.period_start || null,
                periodEnd: oldestCharge.entry.charge?.period_end || null,
                amount: appliedAmount
            });
            creditAmount = roundMoney(creditAmount - appliedAmount);

            if (oldestCharge.remaining <= 0) chargeQueue.shift();
        }
        availableCredit = roundMoney(availableCredit + creditAmount);
        entry.unallocatedAmount = creditAmount;
        if (creditAmount > 0) creditQueue.push({ entry, remaining: creditAmount });
    });

    const outstandingCharges: PaymentLedger['outstandingCharges'] = chargeQueue.map(({ entry, remaining }) => ({
        date: entry.date,
        dateKey: entry.dateKey,
        amount: entry.amount,
        remaining,
        type: entry.type,
        chargeId: entry.charge?.id || null,
        adjustmentId: entry.adjustmentId || null
    }));

    return {
        entries,
        currentBalance: balance,
        balanceAtReference,
        outstandingCharges,
        creditAtReference: availableCredit
    };
}
