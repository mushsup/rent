import { addDays, format, isAfter, isBefore, isSameDay, parseISO, startOfDay } from 'date-fns';
import { formatRussianDate } from '../../utils/russianDate';
import type { Credit, CreditTransaction } from '../../types';

export interface CreditScheduleEntry {
    date: string;
    action: string;
    amount: number;
    graphLabel: string;
    txId?: string;
}

export function generateCreditSchedule(credit: Credit, transactions: CreditTransaction[], today = new Date()): CreditScheduleEntry[] {
    const startDate = startOfDay(parseISO(credit.start_date));
    const initialAmount = Number(credit.amount) || 0;
    const interestRate = (Number(credit.interest_rate) || 0) / 100;
    const currentDateLimit = startOfDay(today);
    const sortedTransactions = transactions
        .filter((transaction) => transaction.credit_id === credit.id)
        .map((transaction) => ({ ...transaction, date: startOfDay(parseISO(transaction.transaction_date)) }))
        .sort((left, right) => left.date.getTime() - right.date.getTime());

    const schedule: CreditScheduleEntry[] = [{
        date: format(startDate, 'dd.MM.yyyy'),
        action: 'Начало кредита',
        amount: initialAmount,
        graphLabel: formatRussianDate(startDate, 'MMM yyyy')
    }];

    let balance = initialAmount;
    let currentDate = startDate;
    let transactionIndex = 0;

    while (!isAfter(currentDate, currentDateLimit)) {
        while (
            transactionIndex < sortedTransactions.length
            && isSameDay(sortedTransactions[transactionIndex].date, currentDate)
        ) {
            const transaction = sortedTransactions[transactionIndex];
            balance += transaction.type === 'payment' ? -Number(transaction.amount) : Number(transaction.amount);
            balance = Math.max(0, balance);
            schedule.push({
                date: format(currentDate, 'dd.MM.yyyy'),
                action: transaction.type === 'payment' ? 'Частичное погашение' : 'Добор кредита',
                amount: balance,
                graphLabel: formatRussianDate(currentDate, 'MMM yyyy'),
                txId: transaction.id
            });
            transactionIndex += 1;
        }

        if (!isBefore(currentDate, currentDateLimit)) break;
        if (credit.type === 'interest' && balance > 0) balance += (balance * interestRate) / 365;
        currentDate = addDays(currentDate, 1);
    }

    return schedule.reverse();
}
