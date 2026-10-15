import { addDays, isAfter, isBefore, isSameDay, isValid, parseISO, startOfDay } from 'date-fns';
import type { Credit, CreditTransaction } from '../types';

export function calculateCreditDebt(
    credit: Credit,
    targetDate: Date = new Date(),
    transactions: CreditTransaction[] = [],
): number {
    // Corrupt or missing dates must yield zero debt, never an infinite loop:
    // startOfDay(Invalid Date) is Invalid, and isAfter(Invalid, Invalid) is
    // false, which would spin the day-by-day loop forever.
    if (!credit?.start_date || !isValid(parseISO(credit.start_date))) return 0;
    const startDate = startOfDay(parseISO(credit.start_date));
    const target = startOfDay(new Date(targetDate));
    if (!isValid(target)) return 0;
    
    if (isBefore(target, startDate)) return 0;

    let balance = Number(credit.amount) || 0;
    const interestRate = (Number(credit.interest_rate) || 0) / 100;
    const sortedTransactions = [...transactions]
        .filter(t => t?.transaction_date && isValid(parseISO(t.transaction_date)))
        .map(t => ({ ...t, date: startOfDay(parseISO(t.transaction_date)) }))
        .filter(t => !isBefore(t.date, startDate) && !isAfter(t.date, target))
        .sort((a, b) => a.date.getTime() - b.date.getTime());

    let currentDate = startDate;
    let transactionIndex = 0;

    while (!isAfter(currentDate, target)) {
        while (transactionIndex < sortedTransactions.length
            && isSameDay(sortedTransactions[transactionIndex].date, currentDate)) {
            const transaction = sortedTransactions[transactionIndex];
            const amount = Number(transaction.amount) || 0;
            balance += transaction.type === 'addition' ? amount : -amount;
            balance = Math.max(0, balance);
            transactionIndex++;
        }

        // Interest accrues after the day's real operations. Do not accrue past
        // the requested target date. Round daily so float dust cannot
        // accumulate over long horizons (storage is NUMERIC(12,2)).
        if (!isBefore(currentDate, target)) break;
        if (credit.type === 'interest' && balance > 0) {
            const dailyInterest = (balance * interestRate) / 365;
            balance = Math.round((balance + dailyInterest) * 100) / 100;
        }

        currentDate = addDays(currentDate, 1);
    }

    return Math.round((Math.max(0, balance) + Number.EPSILON) * 100) / 100;
}
