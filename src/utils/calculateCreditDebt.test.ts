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

  it('ignores the rate for no-interest credits', () => {
    const flat = { ...credit, type: 'no_interest', interest_rate: 999 } as Credit;
    expect(calculateCreditDebt(flat, new Date('2027-01-01'))).toBe(1000);
  });

  it('applies additions after payments on later days', () => {
    const transactions: CreditTransaction[] = [
      { id: 'pay', credit_id: credit.id, type: 'payment', amount: 400, transaction_date: '2026-01-02' },
      { id: 'add', credit_id: credit.id, type: 'addition', amount: 200, transaction_date: '2026-01-03' },
    ];
    // 1000 - 400 + day interest, then + 200 + day interest.
    const result = calculateCreditDebt(credit, new Date('2026-01-04'), transactions);
    expect(result).toBeGreaterThan(800);
    expect(result).toBeLessThan(810);
  });

  it('accrues a leap-day correctly', () => {
    // 1000 at 36.5% for one day: 1000 + 1000 * 0.365 / 365 = 1001.
    // The divisor stays 365 even in a leap year: locked in as a contract.
    const start = { ...credit, start_date: '2024-02-28' };
    expect(calculateCreditDebt(start, new Date('2024-02-29'))).toBe(1001);
  });

  it('returns zero for a missing or corrupt start date', () => {
    expect(calculateCreditDebt({ ...credit, start_date: '' })).toBe(0);
    expect(calculateCreditDebt({ ...credit, start_date: 'garbage' })).toBe(0);
  });

  it('skips transactions with corrupt dates', () => {
    const transactions: CreditTransaction[] = [
      { id: 'bad', credit_id: credit.id, type: 'payment', amount: 1000, transaction_date: 'garbage' },
    ];
    expect(calculateCreditDebt(credit, new Date('2026-01-02'), transactions)).toBeGreaterThan(1000);
  });
});
