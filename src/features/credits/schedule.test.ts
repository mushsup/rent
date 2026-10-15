import { describe, expect, it } from 'vitest';
import { generateCreditSchedule } from './schedule';
import type { Credit, CreditTransaction } from '../../types';

const credit: Credit = {
  id: 'credit-1',
  name: 'Тест',
  start_date: '2026-01-10',
  type: 'no_interest',
  amount: 1000,
  interest_rate: 0,
  payment_day: 1,
  payment_amount: 100,
};

function tx(overrides: Partial<CreditTransaction> & { id: string }): CreditTransaction {
  return {
    credit_id: credit.id,
    type: 'payment',
    amount: 100,
    transaction_date: '2026-01-11',
    ...overrides,
  };
}

describe('generateCreditSchedule', () => {
  it('starts with the loan opening entry', () => {
    const schedule = generateCreditSchedule(credit, [], new Date('2026-01-10'));

    expect(schedule).toHaveLength(1);
    expect(schedule[0]).toMatchObject({ action: 'Начало кредита', amount: 1000 });
  });

  it('records payments and additions with localized actions', () => {
    const schedule = generateCreditSchedule(credit, [
      tx({ id: 'pay', type: 'payment', amount: 400, transaction_date: '2026-01-11' }),
      tx({ id: 'add', type: 'addition', amount: 200, transaction_date: '2026-01-12' }),
    ], new Date('2026-01-12'));

    const actions = schedule.map(entry => entry.action);
    expect(actions).toContain('Частичное погашение');
    expect(actions).toContain('Добор кредита');
    // The schedule is newest-first: the addition day settles at 600 + 200.
    expect(schedule[0]).toMatchObject({ action: 'Добор кредита', amount: 800 });
  });

  it('ignores transactions of other credits and never goes negative', () => {
    const schedule = generateCreditSchedule(credit, [
      tx({ id: 'foreign', credit_id: 'other', amount: 5000, transaction_date: '2026-01-11' }),
      tx({ id: 'huge', amount: 5000, transaction_date: '2026-01-11' }),
    ], new Date('2026-01-11'));

    expect(schedule.every(entry => entry.amount >= 0)).toBe(true);
  });

  it('returns an empty schedule for a corrupt start date', () => {
    expect(generateCreditSchedule({ ...credit, start_date: '' }, [], new Date())).toEqual([]);
    expect(generateCreditSchedule({ ...credit, start_date: 'garbage' }, [], new Date())).toEqual([]);
  });
});
