export interface Payment {
  id?: string;
  tenant_id?: string;
  amount: number | string;
  payment_date: string;
  comment?: string | null;
  created_at?: string | null;
}

export interface PaymentTerm {
  id?: string;
  weekly_payment: number | string;
  discount_amount?: number | string;
  payment_day: number | string;
  effective_from: string;
  effective_to?: string | null;
}

export type BikeStatus = 'available' | 'in_rent' | 'maintenance';
export type BatteryStatus = 'available' | 'in_rent' | 'maintenance';
export type PaymentChargeStatus = 'open' | 'waived';
export type PaymentAdjustmentDirection = 'charge' | 'credit';
export type CreditType = 'interest' | 'no_interest';
export type CreditTransactionType = 'payment' | 'addition';

export function normalizeBikeStatus(value: string | null | undefined): BikeStatus {
  return value === 'in_rent' || value === 'maintenance' ? value : 'available';
}

export function normalizeCreditType(value: string | null | undefined): CreditType {
  return value === 'interest' ? value : 'no_interest';
}

export function normalizeCreditTransactionType(value: string | null | undefined): CreditTransactionType {
  return value === 'addition' ? value : 'payment';
}

export function normalizePaymentChargeStatus(value: string | null | undefined): PaymentChargeStatus {
  return value === 'waived' ? value : 'open';
}

export function normalizePaymentAdjustmentDirection(value: string | null | undefined): PaymentAdjustmentDirection {
  return value === 'charge' ? value : 'credit';
}

export interface PaymentCharge {
  id?: string;
  due_date: string;
  period_start?: string | null;
  period_end?: string | null;
  amount: number | string;
  comment?: string | null;
  status?: PaymentChargeStatus | null;
    is_automatic?: boolean;
    approved_at?: string | null;
  breakdown?: RentalPeriodSegment[];
  created_at?: string | null;
}

export interface PaymentAdjustment {
  id?: string;
  direction: PaymentAdjustmentDirection;
  amount: number | string;
  adjustment_date: string;
  comment?: string | null;
  source_event_id?: string | null;
  balance_override?: number | string | null;
  created_at?: string | null;
}

export type RentalEventType =
  | 'rental_started'
  | 'bike_changed'
  | 'battery_changed'
  | 'rate_changed'
  | 'discount_changed'
  | 'terms_changed'
  | 'day_off'
  | 'rental_ended';

export interface RentalPeriodSegment {
  period_start: string;
  period_end: string;
  days: number;
  bike_id?: string | null;
  bike_model?: string | null;
  bike_type?: string | null;
  battery_config?: string | null;
  weekly_payment: number | string;
  discount_amount?: number | string;
  amount: number | string;
}

export interface RentalEvent {
  id?: string;
  event_type: RentalEventType;
  effective_date: string;
  bike_id?: string | null;
  bike_model?: string | null;
  bike_type?: string | null;
  battery_config?: string | null;
  weekly_payment: number | string;
  discount_amount?: number | string;
  amount?: number | string | null;
  reason?: string | null;
  details?: Record<string, unknown> | null;
  created_at?: string | null;
}

export interface Bike {
  id?: string;
  model?: string | null;
  type?: string | null;
  status?: BikeStatus | null;
  price?: number | string | null;
  voice_code?: string | null;
  assigned_tenant_name?: string | null;
}

export interface Battery {
  id?: string;
  code: string;
  status?: BatteryStatus | null;
  created_at?: string | null;
}

export type BikeTaskStatus = 'open' | 'in_progress' | 'done';
export type BikeTaskPriority = 'low' | 'normal' | 'high';

export interface BikeTask {
  id: string;
  bike_id: string | null;
  title: string;
  description?: string | null;
  status: BikeTaskStatus;
  priority: BikeTaskPriority;
  due_date?: string | null;
  created_at?: string;
  completed_at?: string | null;
  source?: 'site' | 'google_tasks';
  external_id?: string | null;
  external_updated_at?: string | null;
  last_synced_at?: string | null;
  updated_at?: string;
  bike?: Pick<Bike, 'id' | 'model' | 'type' | 'status' | 'voice_code'> | null;
}

export interface Tenant {
  id?: string;
  name?: string | null;
  slug?: string | null;
  created_at?: string | null;
  bike_id?: string | null;
  bikes?: Bike | null;
  weekly_payment?: number | string | null;
  discount_amount?: number | string | null;
  payment_day?: number | string | null;
  next_payment_date?: string | null;
  next_payment_amount?: number | string | null;
  next_payment_comment?: string | null;
  accounting_start_date?: string | null;
  opening_balance?: number | string | null;
  battery_config?: string | null;
  payment_terms?: PaymentTerm[];
  payment_charges?: PaymentCharge[];
  payment_adjustments?: PaymentAdjustment[];
  rental_events?: RentalEvent[];
  payments?: Payment[];
  is_archived?: boolean;
  deposit?: number | string | null;
  phone?: string | null;
  telegram_username?: string | null;
  admin_comment?: string | null;
}

export interface TenantDetail extends Tenant {
  id: string;
  name: string;
  slug: string;
  bikes: Bike | null;
  payments: Payment[];
  payment_terms: PaymentTerm[];
  payment_charges: PaymentCharge[];
  payment_adjustments: PaymentAdjustment[];
  rental_events: RentalEvent[];
}

export interface TenantEditForm extends TenantDetail {
  bike_id: string;
  weekly_payment: number | string;
  battery_config?: string | null;
}

export type PaymentEditorValue = Partial<Payment> & { isExpected?: boolean };

export type DeletableRecord =
  | { type: 'payment'; id: string }
  | { type: 'charge'; id: string }
  | { type: 'adjustment'; id: string };

export interface Credit {
  id: string;
  name: string;
  start_date: string;
  type: CreditType;
  amount: number | string;
  interest_rate?: number | string | null;
  payment_day: number | string;
  payment_amount: number | string;
}

export interface CreditTransaction {
  id: string;
  credit_id: string;
  type: CreditTransactionType;
  amount: number | string;
  transaction_date: string;
}

export type ExpectedLedgerEvent = {
  type: 'expected';
  date: string;
  charge?: PaymentCharge;
  direction?: string;
  sortOrder: 0;
};

export type AdjustmentLedgerEvent = {
  type: 'adjustment';
  date: string;
  amount: number;
  direction: string;
  comment: string;
  createdAt: string | null;
  adjustmentId?: string;
  balanceOverride?: number | null;
  sortOrder: 1 | 3;
};

export type PaymentLedgerEvent = {
  type: 'payment';
  date: string;
  amount: number;
  comment: string;
  createdAt: string | null;
  paymentId?: string;
  sortOrder: 2;
};

export type RentalLedgerEvent = {
  type: 'rental_event';
  date: string;
  amount: number;
  comment: string;
  rentalEvent: RentalEvent;
  createdAt: string | null;
  sortOrder: -1;
};

export type LedgerEvent = RentalLedgerEvent | ExpectedLedgerEvent | AdjustmentLedgerEvent | PaymentLedgerEvent;

export interface LedgerEntry {
  type: LedgerEvent['type'];
  date: Date;
  dateKey: string;
  amount: number;
  signedAmount: number;
  balance: number;
  isCurrentExpected: boolean;
  isAutomatic: boolean;
  isOverdue: boolean;
  comment: string;
  charge?: PaymentCharge;
  adjustmentId?: string;
  balanceOverride?: number | null;
  paymentId?: string;
  rentalEvent?: RentalEvent;
  allocatedAmount: number;
  remainingAmount: number;
  unallocatedAmount: number;
  daysSincePreviousPayment: number | null;
  allocations: Array<{
    chargeId: string | null;
    dateKey: string;
    periodStart: string | null;
    periodEnd: string | null;
    amount: number;
  }>;
}

export interface OutstandingCharge {
  date: Date;
  dateKey: string;
  amount: number;
  remaining: number;
  type: LedgerEvent['type'];
  chargeId: string | null;
  adjustmentId: string | null;
}

export interface PaymentLedger {
  entries: LedgerEntry[];
  currentBalance: number;
  balanceAtReference: number;
  outstandingCharges: OutstandingCharge[];
  creditAtReference: number;
}
