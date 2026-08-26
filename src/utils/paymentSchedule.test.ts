import { describe, expect, it } from 'vitest';
import { getNextPaymentDate, getPaymentDay, getPaymentDayAbbreviation, getScheduledPaymentDate } from './paymentSchedule';

describe('payment schedule', () => {
  it('uses ISO weekdays without timezone-dependent parsing', () => {
    expect(getPaymentDay('2026-07-26')).toBe(7);
    expect(getPaymentDayAbbreviation('2026-07-26')).toBe('ВС');
  });

  it('returns the same day for a schedule starting on the payment day', () => {
    expect(getScheduledPaymentDate('2026-07-27', 1)).toBe('2026-07-27');
  });

  it('returns the following week for the next payment on the same weekday', () => {
    expect(getNextPaymentDate('2026-07-27', 1)).toBe('2026-08-03');
  });
});
