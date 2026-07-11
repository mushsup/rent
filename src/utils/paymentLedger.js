import { addDays, format, parseISO, subDays } from 'date-fns';
import { DEFAULT_PAYMENT_DAY, getPaymentDay, getScheduledPaymentDate } from './paymentSchedule';

const HISTORY_WEEKS_WITHOUT_ANCHOR = 12;

function toDate(value) {
    return typeof value === 'string' ? parseISO(value) : new Date(value);
}

function toDateKey(value) {
    return format(toDate(value), 'yyyy-MM-dd');
}

function compareDates(left, right) {
    return toDate(left).getTime() - toDate(right).getTime();
}

/**
 * Returns the tenant's recurring weekly payment, including a legacy fallback
 * while existing databases complete the rental-term migration.
 * @param {object|null} tenant Tenant record with optional bike relation.
 * @returns {number} Weekly payment amount.
 */
export function getTenantWeeklyPayment(tenant) {
    const weeklyPayment = Number(tenant?.weekly_payment);
    if (weeklyPayment > 0) return weeklyPayment;

    return Number(tenant?.bikes?.price) || 0;
}

/**
 * Builds a chronological ledger of scheduled charges and actual payments.
 * @param {object} tenant Tenant with payment schedule fields.
 * @param {Array<object>} payments Actual payments linked to the tenant.
 * @param {Date|string} referenceDate Date used to determine the current balance.
 * @returns {{entries: Array<object>, currentBalance: number, balanceAtReference: number}}
 * Ledger entries and balances after all entries and after the reference date.
 */
export function buildPaymentLedger(tenant, payments = [], referenceDate = new Date()) {
    if (!tenant) return { entries: [], currentBalance: 0, balanceAtReference: 0 };

    const paymentDay = Number(tenant.payment_day)
        || getPaymentDay(tenant.next_payment_date || referenceDate)
        || DEFAULT_PAYMENT_DAY;
    const nextPaymentKey = tenant.next_payment_date
        ? toDateKey(tenant.next_payment_date)
        : getScheduledPaymentDate(referenceDate, paymentDay);
    const actualPayments = payments.filter(payment => payment?.payment_date);
    const earliestPayment = actualPayments.reduce((earliest, payment) => (
        !earliest || compareDates(payment.payment_date, earliest) < 0 ? payment.payment_date : earliest
    ), null);
    const latestPayment = actualPayments.reduce((latest, payment) => (
        !latest || compareDates(payment.payment_date, latest) > 0 ? payment.payment_date : latest
    ), null);
    const startDate = tenant.created_at
        ? toDateKey(tenant.created_at)
        : earliestPayment
            ? toDateKey(subDays(toDate(earliestPayment), 7))
            : toDateKey(subDays(toDate(nextPaymentKey), HISTORY_WEEKS_WITHOUT_ANCHOR * 7));
    const endDate = latestPayment && compareDates(latestPayment, nextPaymentKey) > 0
        ? toDateKey(latestPayment)
        : nextPaymentKey;
    const terms = (tenant.payment_terms || [])
        .map(term => ({
            ...term,
            weekly_payment: Number(term.weekly_payment) || 0,
            payment_day: Number(term.payment_day) || paymentDay
        }))
        .sort((left, right) => compareDates(left.effective_from, right.effective_from));
    const effectiveTerms = terms.length > 0 ? terms : [{
        weekly_payment: getTenantWeeklyPayment(tenant),
        payment_day: paymentDay,
        effective_from: startDate,
        effective_to: null
    }];

    const expectedDates = new Set();
    effectiveTerms.forEach(term => {
        const termStart = compareDates(term.effective_from, startDate) > 0 ? term.effective_from : startDate;
        const termEnd = term.effective_to && compareDates(term.effective_to, endDate) < 0 ? term.effective_to : endDate;
        let expectedDate = getScheduledPaymentDate(termStart, term.payment_day);
        while (compareDates(expectedDate, termEnd) <= 0) {
            expectedDates.add(expectedDate);
            expectedDate = toDateKey(addDays(toDate(expectedDate), 7));
        }
    });
    // A manually moved current expected payment is still a real ledger event.
    expectedDates.add(nextPaymentKey);

    const events = [
        ...Array.from(expectedDates).map(date => ({ type: 'expected', date, sortOrder: 0 })),
        ...actualPayments.map(payment => ({
            type: 'payment',
            date: toDateKey(payment.payment_date),
            amount: Number(payment.amount) || 0,
            comment: payment.comment || '',
            paymentId: payment.id,
            sortOrder: 1
        }))
    ].sort((left, right) => compareDates(left.date, right.date) || left.sortOrder - right.sortOrder);

    const expectedOverride = tenant.next_payment_amount != null ? Number(tenant.next_payment_amount) : null;
    let balance = 0;
    let balanceAtReference = 0;
    const referenceKey = toDateKey(referenceDate);
    const entries = events.map(event => {
        const term = event.type === 'expected'
            ? effectiveTerms.find(candidate => (
                compareDates(event.date, candidate.effective_from) >= 0
                && (!candidate.effective_to || compareDates(event.date, candidate.effective_to) <= 0)
            )) || effectiveTerms[effectiveTerms.length - 1]
            : null;
        const amount = event.type === 'expected'
            ? (event.date === nextPaymentKey && expectedOverride != null ? expectedOverride : term.weekly_payment)
            : event.amount;
        const signedAmount = event.type === 'expected' ? amount : -amount;
        balance += signedAmount;
        if (compareDates(event.date, referenceKey) <= 0) balanceAtReference = balance;

        return {
            ...event,
            amount,
            signedAmount,
            balance,
            date: toDate(event.date),
            dateKey: event.date,
            isCurrentExpected: event.type === 'expected' && event.date === nextPaymentKey,
            isOverdue: event.type === 'expected' && compareDates(event.date, referenceKey) <= 0,
            comment: event.type === 'expected'
                ? (event.date === nextPaymentKey ? tenant.next_payment_comment || '' : '')
                : event.comment || ''
        };
    });

    return {
        entries,
        currentBalance: balance,
        balanceAtReference
    };
}
