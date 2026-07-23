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
  payment_day: number | string;
  effective_from: string;
  effective_to?: string | null;
}

export interface PaymentCharge {
  id?: string;
  due_date: string;
  amount: number | string;
  comment?: string | null;
  status?: string | null;
  is_automatic?: boolean;
  created_at?: string | null;
}

export interface PaymentAdjustment {
  id?: string;
  direction: 'charge' | 'credit' | string;
  amount: number | string;
  adjustment_date: string;
  comment?: string | null;
  created_at?: string | null;
}

export interface Bike {
  id?: string;
  model?: string | null;
  type?: string | null;
  status?: string | null;
  price?: number | string | null;
}

export interface Tenant {
  id?: string;
  name?: string | null;
  slug?: string | null;
  created_at?: string | null;
  bike_id?: string | null;
  bikes?: Bike | null;
  weekly_payment?: number | string | null;
  payment_day?: number | string | null;
  next_payment_date?: string | null;
  next_payment_amount?: number | string | null;
  next_payment_comment?: string | null;
  payment_terms?: PaymentTerm[];
  payment_charges?: PaymentCharge[];
  payment_adjustments?: PaymentAdjustment[];
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
}

export interface TenantEditForm extends TenantDetail {
  bike_id: string;
  weekly_payment: number | string;
}

export type PaymentEditorValue = Partial<Payment> & { isExpected?: boolean };

export type DeletableRecord =
  | { type: 'payment'; id: string }
  | { type: 'adjustment'; id: string };

export interface Credit {
  id: string;
  name: string;
  start_date: string;
  type: 'interest' | 'no_interest' | string;
  amount: number | string;
  interest_rate?: number | string | null;
  payment_day: number | string;
  payment_amount: number | string;
}

export interface CreditTransaction {
  id: string;
  credit_id: string;
  type: 'payment' | 'addition' | string;
  amount: number | string;
  transaction_date: string;
}

export type ExpectedLedgerEvent = {
  type: 'expected';
  date: string;
  charge?: PaymentCharge;
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
  sortOrder: 1;
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

export type LedgerEvent = ExpectedLedgerEvent | AdjustmentLedgerEvent | PaymentLedgerEvent;

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
  paymentId?: string;
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
