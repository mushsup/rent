import { describe, expect, it } from 'vitest';
import { getRentalEndPreview } from './rentalEnd';
import type { Tenant } from '../types';

const tenant: Tenant = {
  id: 'tenant-1',
  bike_id: 'bike-1',
  weekly_payment: 350,
  payment_charges: [{
    id: 'charge-1',
    due_date: '2026-07-27',
    period_start: '2026-07-21',
    period_end: '2026-07-27',
    amount: 350,
    status: 'open',
  }],
};

describe('rental end preview', () => {
  it('prorates the current weekly charge by used calendar days', () => {
    expect(getRentalEndPreview(tenant, '2026-07-24')).toMatchObject({
      periodStart: '2026-07-21',
      periodEnd: '2026-07-24',
      usedDays: 4,
      totalDays: 7,
      suggestedAmount: 200,
    });
  });

  it('keeps the full amount at the end of the period', () => {
    expect(getRentalEndPreview(tenant, '2026-07-27').suggestedAmount).toBe(350);
  });

  it('supports a tenant without a generated charge', () => {
    expect(getRentalEndPreview({ ...tenant, payment_charges: [] }, '2026-07-24')).toMatchObject({
      periodStart: '2026-07-24',
      periodEnd: '2026-07-24',
      usedDays: 1,
      totalDays: 7,
      suggestedAmount: 50,
    });
  });

  it('caps the preview when the end date is after the charge period', () => {
    expect(getRentalEndPreview(tenant, '2026-08-10')).toMatchObject({
      usedDays: 7,
      totalDays: 7,
      suggestedAmount: 350,
    });
  });

  it('returns zeros for a missing or corrupt end date', () => {
    expect(getRentalEndPreview(tenant, '')).toMatchObject({ usedDays: 0, totalDays: 0, suggestedAmount: 0 });
    expect(getRentalEndPreview(tenant, 'garbage')).toMatchObject({ usedDays: 0, totalDays: 0, suggestedAmount: 0 });
  });

  it('suggests nothing when the end date precedes the charge period', () => {
    expect(getRentalEndPreview(tenant, '2026-07-10')).toMatchObject({
      usedDays: 0,
      suggestedAmount: 0,
    });
  });
});
