import { describe, expect, it } from 'vitest';
import { calculateDebt } from './calculateDebt';
import type { Tenant } from '../types';

const tenant: Tenant = {
  id: 'tenant-1',
  bike_id: 'bike-1',
  weekly_payment: 300,
  next_payment_date: '2026-07-26',
  next_payment_amount: 300,
  payment_charges: [{ id: 'charge-1', due_date: '2026-07-26', amount: 300 }],
  payment_adjustments: [],
};

describe('calculateDebt', () => {
  it('treats an unpaid charge on the reference day as due today, not overdue', () => {
    expect(calculateDebt(tenant, [], '2026-07-26')).toMatchObject({
      totalDebt: 300,
      overdueAmount: 0,
      dueTodayAmount: 300,
      isOverdue: false,
      hasDueToday: true,
    });
  });

  it('applies a same-day payment to the oldest outstanding charge', () => {
    expect(calculateDebt(tenant, [{ amount: 300, payment_date: '2026-07-26' }], '2026-07-26')).toMatchObject({
      totalDebt: 0,
      dueTodayAmount: 0,
      paidTotal: 300,
    });
  });

  it('does not create debt on the first day of a rental paid in arrears', () => {
    expect(calculateDebt({
      ...tenant,
      accounting_start_date: '2026-08-27',
      next_payment_date: '2026-09-03',
      payment_charges: [{
        id: 'first-week',
        due_date: '2026-09-03',
        period_start: '2026-08-27',
        period_end: '2026-09-02',
        amount: 300,
      }],
    }, [], '2026-08-27')).toMatchObject({
      totalDebt: 0,
      overdueAmount: 0,
      dueTodayAmount: 0,
      isOverdue: false,
      hasDueToday: false,
    });
  });

  it('never creates floating-point residue', () => {
    const result = calculateDebt({ ...tenant, next_payment_amount: 0.3, payment_charges: [{ due_date: '2026-07-25', amount: 0.3 }] }, [{ amount: 0.1, payment_date: '2026-07-25' }], '2026-07-26');
    expect(result.totalDebt).toBe(0.5);
  });

  it('has no next payment when the tenant has no bike', () => {
    expect(calculateDebt({
      ...tenant,
      bike_id: null,
      next_payment_date: null,
      next_payment_amount: null,
      payment_charges: [],
    })).toMatchObject({
      totalDebt: 0,
      nextPaymentDate: null,
      expectedAmount: 0,
    });
  });
});
