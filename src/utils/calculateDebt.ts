import { format, isValid, parseISO } from 'date-fns';
import { buildPaymentLedger } from './paymentLedger';
import type { Payment, Tenant } from '../types';

export { getTenantWeeklyPayment } from './paymentLedger';

/**
 * Debt glossary (single source of truth, mirrored by dashboardSelectors):
 * - overdue: charges with dateKey strictly before today;
 * - due today: outstanding charges dated today that are not waived and not
 *   yet approved on the approvals screen (approval confirms the charge but
 *   does not pay it, so approved charges stay in the debt until paid —
 *   they only leave the "due today" work queue).
 */
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
            unapprovedDueTodayCount: 0,
            hasUnapprovedDueToday: false,
            oldestUnpaidDate: null,
            oldestUnpaidDateKey: null,
            nextPaymentDate: null,
            expectedAmount: 0,
            paidTotal: 0
        };
    }

    const hasActiveRental = Boolean(tenant.bike_id) && !tenant.is_archived;
    const nextPaymentDate = hasActiveRental && tenant.next_payment_date && isValid(parseISO(tenant.next_payment_date))
        ? parseISO(tenant.next_payment_date)
        : null;
    const reference = typeof referenceDate === 'string' ? parseISO(referenceDate) : referenceDate;
    const todayKey = isValid(reference) ? format(reference, 'yyyy-MM-dd') : format(new Date(), 'yyyy-MM-dd');

    const paymentLedger = buildPaymentLedger(tenant, payments, referenceDate);
    const expectedAmount = paymentLedger.entries.find(entry => entry.isCurrentExpected)?.amount || 0;
    const totalDebt = paymentLedger.outstandingCharges.reduce((sum, charge) => sum + charge.remaining, 0);
    const overdueAmount = paymentLedger.outstandingCharges
        .filter(charge => charge.dateKey < todayKey)
        .reduce((sum, charge) => sum + charge.remaining, 0);
    const dueTodayAmount = paymentLedger.outstandingCharges
        .filter(charge => charge.dateKey === todayKey)
        .reduce((sum, charge) => sum + charge.remaining, 0);
    const approvedByChargeId = new Map(
        paymentLedger.entries
            .filter(entry => entry.type === 'expected' && entry.charge?.id)
            .map(entry => [entry.charge!.id as string, Boolean(entry.charge!.approved_at)])
    );
    const unapprovedDueTodayCount = paymentLedger.outstandingCharges
        .filter(charge => charge.dateKey === todayKey
            && charge.type === 'expected'
            && !approvedByChargeId.get(charge.chargeId || '')).length;
    const oldestUnpaidCharge = paymentLedger.outstandingCharges[0] || null;
    // Corrupt payment rows (bad date or non-numeric amount) must not poison
    // totals with NaN: they are skipped instead of crashing the page.
    const validPayments = payments.filter(payment => payment?.payment_date && isValid(parseISO(payment.payment_date)));
    const sortedPayments = [...validPayments].sort((a, b) => parseISO(b.payment_date).getTime() - parseISO(a.payment_date).getTime());

    return {
        totalDebt: Math.round((totalDebt + Number.EPSILON) * 100) / 100,
        overdueAmount: Math.round((overdueAmount + Number.EPSILON) * 100) / 100,
        dueTodayAmount: Math.round((dueTodayAmount + Number.EPSILON) * 100) / 100,
        isOverdue: overdueAmount > 0,
        hasDueToday: dueTodayAmount > 0,
        unapprovedDueTodayCount,
        hasUnapprovedDueToday: unapprovedDueTodayCount > 0,
        oldestUnpaidDate: oldestUnpaidCharge?.date || null,
        oldestUnpaidDateKey: oldestUnpaidCharge?.dateKey || null,
        nextPaymentDate,
        expectedAmount,
        paidTotal: sortedPayments.reduce((sum, p) => sum + (Number.isFinite(Number(p.amount)) ? Number(p.amount) : 0), 0)
    };
}
