import { format } from 'date-fns';
import { calculateCreditDebt } from '../../utils/calculateCreditDebt';
import { formatRussianDate } from '../../utils/russianDate';
import type { Credit, CreditTransaction } from '../../types';

export type CreditChartPoint = { date: string; label: string; debtAmount: number };

function transactionsByCredit(transactions: CreditTransaction[]) {
    return transactions.reduce<Map<string, CreditTransaction[]>>((result, transaction) => {
        const creditTransactions = result.get(transaction.credit_id) || [];
        creditTransactions.push(transaction);
        result.set(transaction.credit_id, creditTransactions);
        return result;
    }, new Map());
}

export function getCreditDebt(
    credit: Credit,
    transactions: CreditTransaction[],
    referenceDate: Date = new Date()
) {
    return calculateCreditDebt(credit, referenceDate, transactions.filter(transaction => transaction.credit_id === credit.id));
}

export function getTotalCreditDebt(
    credits: Credit[],
    transactions: CreditTransaction[],
    referenceDate: Date = new Date()
) {
    const groupedTransactions = transactionsByCredit(transactions);
    return credits.reduce((sum, credit) => sum + calculateCreditDebt(credit, referenceDate, groupedTransactions.get(credit.id) || []), 0);
}

export function buildCreditDebtChartData(
    credits: Credit[],
    transactions: CreditTransaction[],
    referenceDate: Date = new Date()
): CreditChartPoint[] {
    if (credits.length === 0) return [];

    const groupedTransactions = transactionsByCredit(transactions);
    const earliestDate = credits.reduce(
        (minimum, credit) => credit.start_date < minimum ? credit.start_date : minimum,
        credits[0].start_date
    );
    const current = new Date(`${earliestDate}T00:00:00`);
    current.setDate(1);
    const data: CreditChartPoint[] = [];

    while (current <= referenceDate) {
        data.push({
            date: format(current, 'yyyy-MM-dd'),
            label: formatRussianDate(current, 'MMM yyyy'),
            debtAmount: credits.reduce((sum, credit) => sum + calculateCreditDebt(credit, current, groupedTransactions.get(credit.id) || []), 0)
        });
        current.setMonth(current.getMonth() + 1);
    }

    const currentMonth = format(referenceDate, 'yyyy-MM');
    if (data[data.length - 1]?.date.substring(0, 7) !== currentMonth) {
        data.push({
            date: format(referenceDate, 'yyyy-MM-dd'),
            label: formatRussianDate(referenceDate, 'MMM yyyy'),
            debtAmount: getTotalCreditDebt(credits, transactions, referenceDate)
        });
    }

    return data;
}
