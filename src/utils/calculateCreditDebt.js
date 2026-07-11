import { parseISO, differenceInDays, addDays, isAfter, isBefore, startOfDay, format } from 'date-fns';

export const calculateCreditDebt = (credit, targetDate = new Date(), transactions = []) => {
    const startDate = startOfDay(parseISO(credit.start_date));
    const target = startOfDay(new Date(targetDate));
    
    if (isBefore(target, startDate)) return 0;

    let balance = parseFloat(credit.amount) || 0;
    const interestRate = (parseFloat(credit.interest_rate) || 0) / 100;
    const regularPayment = parseFloat(credit.payment_amount) || 0;
    const paymentDay = parseInt(credit.payment_day) || 1;

    // Sort transactions by date
    const sortedTransactions = [...transactions]
        .map(t => ({ ...t, date: startOfDay(parseISO(t.transaction_date)) }))
        .sort((a, b) => a.date - b.date);

    let currentDate = startDate;
    let transactionIndex = 0;

    while (isBefore(currentDate, target)) {
        // 1. Calculate and add daily interest (accrued at the end of the day)
        if (credit.type === 'interest' && balance > 0) {
            const dailyInterest = (balance * interestRate) / 365;
            balance += dailyInterest;
        }

        // 2. Advance to the next day
        currentDate = addDays(currentDate, 1);

        // 3. Apply custom transactions for this day
        while (transactionIndex < sortedTransactions.length && 
               !isAfter(sortedTransactions[transactionIndex].date, currentDate) && 
               !isBefore(sortedTransactions[transactionIndex].date, currentDate)) {
            const tx = sortedTransactions[transactionIndex];
            if (tx.type === 'payment') balance -= tx.amount;
            else if (tx.type === 'addition') balance += tx.amount;
            transactionIndex++;
        }

        // 4. Apply regular payment if it's the payment day
        if (currentDate.getDate() === paymentDay) {
            balance -= regularPayment;
        }

        if (balance < 0) balance = 0;
    }

    return balance > 0 ? balance : 0;
};
