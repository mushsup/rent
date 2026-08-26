import { format, parseISO } from 'date-fns';
import { buildPaymentLedger } from './paymentLedger';
import type { Payment, Tenant } from '../types';

export { getTenantWeeklyPayment } from './paymentLedger';

export function calculateDebt(
    tenant: Tenant | null | undefined,
    payments: Payment[] = [],
    referenceDate: Date | string = new Date(),
) {
    if (!tenant) {
        return {
            totalDebt: 0,
            overdueAmount: 0,
            dueTodayAmount: 0,
            isOverdue: false,
            hasDueToday: false,
            oldestUnpaidDate: null,
            oldestUnpaidDateKey: null,
            nextPaymentDate: null,
            expectedAmount: 0,
            paidTotal: 0
        };
    }

    const hasActiveRental = Boolean(tenant.bike_id) && !tenant.is_archived;
    const nextPaymentDate = hasActiveRental && tenant.next_payment_date ? parseISO(tenant.next_payment_date) : null;
    const todayKey = format(typeof referenceDate === 'string' ? parseISO(referenceDate) : referenceDate, 'yyyy-MM-dd');

    const paymentLedger = buildPaymentLedger(tenant, payments, referenceDate);
    const expectedAmount = paymentLedger.entries.find(entry => entry.isCurrentExpected)?.amount || 0;
    const totalDebt = paymentLedger.outstandingCharges.reduce((sum, charge) => sum + charge.remaining, 0);
    const overdueAmount = paymentLedger.outstandingCharges
        .filter(charge => charge.dateKey < todayKey)
        .reduce((sum, charge) => sum + charge.remaining, 0);
    const dueTodayAmount = paymentLedger.outstandingCharges
        .filter(charge => charge.dateKey === todayKey)
        .reduce((sum, charge) => sum + charge.remaining, 0);
    const oldestUnpaidCharge = paymentLedger.outstandingCharges[0] || null;
    const sortedPayments = [...payments].sort((a, b) => new Date(b.payment_date).getTime() - new Date(a.payment_date).getTime());

    return {
        totalDebt: Math.round((totalDebt + Number.EPSILON) * 100) / 100,
        overdueAmount: Math.round((overdueAmount + Number.EPSILON) * 100) / 100,
        dueTodayAmount: Math.round((dueTodayAmount + Number.EPSILON) * 100) / 100,
        isOverdue: overdueAmount > 0,
        hasDueToday: dueTodayAmount > 0,
        oldestUnpaidDate: oldestUnpaidCharge?.date || null,
        oldestUnpaidDateKey: oldestUnpaidCharge?.dateKey || null,
        nextPaymentDate,
        expectedAmount,
        paidTotal: sortedPayments.reduce((sum, p) => sum + (Number(p.amount) || 0), 0)
    };
}
