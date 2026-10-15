import { addDays, differenceInCalendarDays, format, isValid, parseISO } from 'date-fns';
import type { PaymentCharge, Tenant } from '../types';

export interface RentalEndPreview {
  charge: PaymentCharge | null;
  periodStart: string;
  periodEnd: string;
  usedDays: number;
  totalDays: number;
  suggestedAmount: number;
}

function roundMoney(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

export function getRentalEndPreview(tenant: Tenant, endDate: string): RentalEndPreview {
  const empty: RentalEndPreview = { charge: null, periodStart: endDate, periodEnd: endDate, usedDays: 0, totalDays: 0, suggestedAmount: 0 };
  // User input from the modal: never crash on an empty or malformed date.
  if (!endDate || !isValid(parseISO(endDate))) return empty;
  const charges = (tenant.payment_charges || [])
    .filter(charge => charge.status !== 'waived' && charge.period_start && charge.period_end)
    .sort((left, right) => left.period_end!.localeCompare(right.period_end!));
  const charge = charges.find(item => item.period_start! <= endDate && item.period_end! >= endDate)
    || charges.find(item => item.period_start! > endDate)
    || [...charges].reverse().find(item => item.period_end! < endDate)
    || null;

  const periodStart = charge?.period_start || format(parseISO(endDate), 'yyyy-MM-dd');
  const originalPeriodEnd = charge?.period_end || format(addDays(parseISO(endDate), 6), 'yyyy-MM-dd');
  // An end date before the charge period means zero used days, not one.
  if (endDate < periodStart) return { charge, periodStart, periodEnd: periodStart, usedDays: 0, totalDays: 0, suggestedAmount: 0 };
  const periodEnd = endDate;
  const totalDays = Math.max(differenceInCalendarDays(parseISO(originalPeriodEnd), parseISO(periodStart)) + 1, 1);
  const usedDays = Math.min(
    Math.max(differenceInCalendarDays(parseISO(periodEnd), parseISO(periodStart)) + 1, 0),
    totalDays
  );
  const baseAmount = Number(charge?.amount ?? tenant.weekly_payment) || 0;

  return {
    charge,
    periodStart,
    periodEnd,
    usedDays,
    totalDays,
    suggestedAmount: roundMoney(baseAmount * usedDays / totalDays),
  };
}
