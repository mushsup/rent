import { describe, expect, it } from 'vitest';
import { calculateCreditDebt } from './calculateCreditDebt';
import type { Credit, CreditTransaction } from '../types';

const credit: Credit = {
  id: 'credit-1',
  name: 'Тест',
  start_date: '2026-01-01',
  type: 'interest',
  amount: 1000,
  interest_rate: 36.5,
  payment_day: 1,
  payment_amount: 100,
};

describe('calculateCreditDebt', () => {
  it('does not accrue before the credit start date', () => {
    expect(calculateCreditDebt(credit, new Date('2025-12-31'))).toBe(0);
  });

  it('applies same-day operations before daily interest', () => {
    const transactions: CreditTransaction[] = [{
      id: 'tx-1',
      credit_id: credit.id,
      type: 'payment',
      amount: 500,
      transaction_date: '2026-01-01',
    }];
    expect(calculateCreditDebt(credit, new Date('2026-01-02'), transactions)).toBe(500.5);
  });

  it('never returns a negative balance after an overpayment', () => {
    const transactions: CreditTransaction[] = [{
      id: 'tx-2',
      credit_id: credit.id,
      type: 'payment',
      amount: 2000,
      transaction_date: '2026-01-01',
    }];
    expect(calculateCreditDebt(credit, new Date('2026-02-01'), transactions)).toBe(0);
  });
});
