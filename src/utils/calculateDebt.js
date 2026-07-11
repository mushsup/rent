import { addDays } from 'date-fns';

export function calculateDebt(tenant, payments) {
    if (!tenant) {
        return { totalDebt: 0, nextPaymentDate: null, isOverdue: false, expectedAmount: 0, paidTotal: 0 };
    }

    const price = tenant.bikes?.price || 0;

    // Use the next_payment_date from the database, or default to today if not set
    const nextPaymentDate = tenant.next_payment_date ? new Date(tenant.next_payment_date) : new Date();

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    // Normalize nextPaymentDate to remove time component for strict date comparison
    const normalizedNextDate = new Date(nextPaymentDate);
    normalizedNextDate.setHours(0, 0, 0, 0);

    const isOverdue = normalizedNextDate <= today;

    // Use specific next payment amount if set, otherwise fallback to standard bike price
    const expectedAmount = tenant.next_payment_amount != null ? Number(tenant.next_payment_amount) : price;

    // Sort payments by date descending
    const sortedPayments = (payments || []).sort((a, b) => new Date(b.payment_date) - new Date(a.payment_date));

    return {
        totalDebt: isOverdue ? expectedAmount : 0, // Simplified logic: if overdue, debt is the expected amount
        isOverdue,
        nextPaymentDate,
        expectedAmount,
        paidTotal: sortedPayments.reduce((sum, p) => sum + (Number(p.amount) || 0), 0)
    };
}
