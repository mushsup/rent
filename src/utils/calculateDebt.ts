import { format, parseISO } from 'date-fns';
import { buildPaymentLedger, getTenantWeeklyPayment } from './paymentLedger';
import type { Payment, Tenant } from '../types';

export { getTenantWeeklyPayment } from './paymentLedger';

export function calculateDebt(tenant: Tenant | null | undefined, payments: Payment[] = []) {
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

    const nextPaymentDate = tenant.next_payment_date ? parseISO(tenant.next_payment_date) : new Date();
    const todayKey = format(new Date(), 'yyyy-MM-dd');

    // Use a one-off expected amount when present, otherwise use the tenant's recurring weekly payment.
    const expectedAmount = tenant.next_payment_amount != null
        ? Number(tenant.next_payment_amount)
        : getTenantWeeklyPayment(tenant);

    // Sort payments by date descending
    const paymentLedger = buildPaymentLedger(tenant, payments);
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
