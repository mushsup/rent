import { supabase } from '../../lib/supabase';
import { normalizeBikeStatus, normalizePaymentAdjustmentDirection, normalizePaymentChargeStatus, type Bike, type DeletableRecord, type PaymentAdjustment, type PaymentCharge, type PaymentEditorValue, type Tenant, type TenantDetail, type TenantEditForm } from '../../types';
import { RESERVED_SLUGS, slugify, uniqueSlug } from '../../utils/slug';
import { format } from 'date-fns';

const TENANT_IDENTITY_FIELDS = [
    'id',
    'name',
    'slug',
    'bike_id',
    'is_archived',
    'phone',
    'telegram_username',
    'battery_config',
    'weekly_payment',
    'discount_amount',
    'payment_day',
    'deposit',
    'admin_comment'
];

const TENANT_ACCOUNTING_FIELDS = [
    'next_payment_date',
    'next_payment_amount',
    'next_payment_comment',
    'accounting_start_date',
    'opening_balance',
    'payments(id, amount, payment_date, comment, created_at)',
    'payment_terms:tenant_payment_terms(id, weekly_payment, discount_amount, payment_day, effective_from, effective_to)',
    'payment_charges:tenant_payment_charges(id, due_date, period_start, period_end, amount, breakdown, comment, status, is_automatic, approved_at, created_at)',
    'payment_adjustments:tenant_payment_adjustments(id, direction, amount, balance_override, adjustment_date, comment, source_event_id, created_at)',
    'rental_events:tenant_rental_events(id, event_type, effective_date, bike_id, bike_model, bike_type, battery_config, weekly_payment, discount_amount, amount, reason, details, created_at)',
    'bikes(id, model, type, status)'
];

const TENANT_DETAIL_SELECT = [...TENANT_IDENTITY_FIELDS, ...TENANT_ACCOUNTING_FIELDS].join(', ');
function normalizeTenant(data: unknown): TenantDetail | null {
    if (!data) return null;

    const tenant = data as TenantDetail;
    return {
        ...tenant,
        bikes: normalizeBikeRelation(tenant.bikes),
        rental_events: [...(tenant.rental_events || [])].sort(
            (left, right) => left.effective_date.localeCompare(right.effective_date)
                || String(left.created_at || '').localeCompare(String(right.created_at || ''))
        ),
        payments: [...(tenant.payments || [])].sort(
            (left, right) => new Date(right.payment_date).getTime() - new Date(left.payment_date).getTime()
        )
    };
}

function normalizeBikeRelation(value: Bike | Bike[] | null | undefined): Bike | null {
    return Array.isArray(value) ? value[0] || null : value || null;
}

export async function fetchBikes(): Promise<Bike[]> {
    const { data, error } = await supabase
        .from('bikes')
        .select('id, model, type, status, tenants(id, name)')
        .order('model');

    if (error) throw error;
    return (data || []).map((bike) => {
        const assignedTenant = Array.isArray(bike.tenants) ? bike.tenants[0] : bike.tenants;
        return { ...bike, status: normalizeBikeStatus(bike.status), assigned_tenant_name: assignedTenant?.name || null };
    });
}

/** Complete inventory data required when assigning a rental. */
export async function fetchRentalBikeOptions(): Promise<Bike[]> {
    return fetchBikes();
}

export async function fetchTenantDetail(id: string): Promise<TenantDetail | null> {
    // Charge generation writes to the database. It must never take the
    // readable tenant data down with it: a failed ensure degrades to a
    // warning and the page still renders from persisted rows.
    const { error: scheduleError } = await supabase.rpc('ensure_tenant_payment_charges', {
        p_tenant_id: id,
        p_reference_date: format(new Date(), 'yyyy-MM-dd'),
    });
    if (scheduleError) console.warn('ensure_tenant_payment_charges failed, reading persisted data instead', scheduleError);

    const { data, error } = await supabase
        .from('tenants')
        .select(TENANT_DETAIL_SELECT)
        .eq('id', id)
        .maybeSingle();

    if (error) throw error;
    return normalizeTenant(data);
}

export async function fetchPublicTenantProfile(slug: string): Promise<Tenant | null> {
    const { data, error } = await supabase.rpc('get_public_tenant_profile', { p_slug: slug });
    if (error) throw error;
    return data as Tenant | null;
}

export interface DashboardSnapshot {
    tenants: Tenant[];
    bikes: Pick<Bike, 'id' | 'status'>[];
}

export async function fetchDashboardSnapshot(showArchived: boolean): Promise<DashboardSnapshot> {
    const snapshotResult = await supabase.rpc('get_dashboard_snapshot', {
        p_reference_date: format(new Date(), 'yyyy-MM-dd'),
        p_show_archived: showArchived,
    });
    if (snapshotResult.error) throw snapshotResult.error;

    const snapshot = (snapshotResult.data || {}) as { tenants?: Array<Tenant & { bikes?: Bike | Bike[] | null }>; bikes?: Pick<Bike, 'id' | 'status'>[] };
    // Scope the adjustments read to the tenants on screen instead of
    // pulling the whole table on every dashboard load.
    const tenantIds = (snapshot.tenants || []).map(tenant => tenant.id).filter((id): id is string => Boolean(id));
    const adjustmentsQuery = supabase
        .from('tenant_payment_adjustments')
        .select('id, tenant_id, direction, amount, balance_override, adjustment_date, comment, source_event_id, created_at');
    const { data: adjustmentsData, error: adjustmentsError } = tenantIds.length > 0
        ? await adjustmentsQuery.in('tenant_id', tenantIds)
        : { data: [], error: null };
    if (adjustmentsError) throw adjustmentsError;
    const adjustmentsByTenant = new Map<string, PaymentAdjustment[]>();
    (adjustmentsData || []).forEach((adjustment) => {
        const tenantAdjustments = adjustmentsByTenant.get(adjustment.tenant_id) || [];
        tenantAdjustments.push({ ...adjustment, direction: normalizePaymentAdjustmentDirection(adjustment.direction) });
        adjustmentsByTenant.set(adjustment.tenant_id, tenantAdjustments);
    });
    const tenants = (snapshot.tenants || []).map((tenant) => {
        const bike = normalizeBikeRelation(tenant.bikes);
        return {
            ...tenant,
            bikes: bike ? { ...bike, status: normalizeBikeStatus(bike.status) } : null,
            payment_charges: (tenant.payment_charges || []).map((charge) => ({ ...charge, status: normalizePaymentChargeStatus(charge.status) })),
            payment_adjustments: adjustmentsByTenant.get(tenant.id || '')
                || (tenant.payment_adjustments || []).map((adjustment) => ({ ...adjustment, direction: normalizePaymentAdjustmentDirection(adjustment.direction) })),
        };
    });

    return {
        tenants,
        bikes: (snapshot.bikes || []).map((bike) => ({ ...bike, status: normalizeBikeStatus(bike.status) })),
    };
}

/** Loads only today's pending charges for the approval screen. */
export async function fetchTodayPaymentApprovals(referenceDate = new Date()): Promise<Tenant[]> {
    const todayKey = format(referenceDate, 'yyyy-MM-dd');
    // Same rule as fetchTenantDetail: a failed generation must not hide
    // the already persisted charges from the approval screen.
    const { error: scheduleError } = await supabase.rpc('ensure_all_tenant_payment_charges', {
        p_reference_date: todayKey,
    });
    if (scheduleError) console.warn('ensure_all_tenant_payment_charges failed, reading persisted charges instead', scheduleError);

    const { data, error } = await supabase
        .from('tenants')
        .select('id, name, battery_config, bikes(id, model, type, status), payment_charges:tenant_payment_charges!inner(id, due_date, amount, breakdown, created_at, approved_at, status)')
        .eq('is_archived', false)
        .lte('payment_charges.due_date', todayKey)
        .is('payment_charges.approved_at', null)
        .neq('payment_charges.status', 'waived')
        .order('created_at', { foreignTable: 'payment_charges', ascending: true });

    if (error) throw error;
    return (data || []).map((tenant) => ({
        ...tenant,
        bikes: normalizeBikeRelation(tenant.bikes as unknown as Bike | Bike[] | null),
        payment_charges: (tenant.payment_charges || []).map((charge) => ({
            ...charge,
            status: normalizePaymentChargeStatus(charge.status),
        })),
    })) as unknown as Tenant[];
}

export async function approveTenantPaymentCharge(chargeId: string): Promise<void> {
    const { error } = await supabase.rpc('approve_tenant_payment_charge', { p_charge_id: chargeId });
    if (error) throw error;
}

export async function updateTenantProfile(id: string, form: TenantEditForm): Promise<void> {
    const name = form.name.trim();
    const slug = slugify(form.slug);
    if (!name) throw new Error('Укажите имя арендатора');
    if (!slug) throw new Error('Укажите псевдоним ссылки');
    if (RESERVED_SLUGS.has(slug)) throw new Error('Псевдоним зарезервирован');

    const { error: profileError } = await supabase.rpc('update_tenant_profile', {
        p_tenant_id: id,
        p_name: name,
        p_slug: slug,
        p_bike_id: form.bike_id || null,
        p_weekly_payment: Number(form.weekly_payment) || 0,
        p_payment_day: Number(form.payment_day),
        p_next_payment_date: form.next_payment_date || null,
        p_deposit: Number(form.deposit) || 0,
        p_admin_comment: form.admin_comment || null,
        p_phone: form.phone?.trim() || null,
        p_telegram_username: normalizeTelegram(form.telegram_username) || null,
        p_battery_config: form.battery_config || null,
        // Permanent discounts are no longer part of the rental workflow.
        p_discount_amount: 0,
        p_effective_date: format(new Date(), 'yyyy-MM-dd'),
    });

    if (profileError) throw profileError;
}

export interface NewTenantInput {
    name: string;
    slug: string;
    bike_id: string;
    weekly_payment: number | string;
    payment_day: number | string;
    next_payment_date: string | null;
    deposit: number | string;
    phone?: string;
    telegram_username?: string;
    battery_config?: string | null;
}

export async function createTenant(input: NewTenantInput): Promise<{ slug: string }> {
    const name = input.name.trim();
    if (!name) throw new Error('Укажите имя арендатора');
    const { data: existingTenants, error: existingTenantsError } = await supabase
        .from('tenants')
        .select('slug');
    if (existingTenantsError) throw existingTenantsError;

    const slug = uniqueSlug(input.slug || name, (existingTenants || []).map(tenant => tenant.slug));
    const { error } = await supabase.rpc('create_tenant_with_rental', {
        p_name: name,
        p_slug: slug,
        p_bike_id: input.bike_id || null,
        p_weekly_payment: Number(input.weekly_payment) || 0,
        p_payment_day: Number(input.payment_day),
        p_first_payment_date: input.next_payment_date || null,
        p_deposit: Number(input.deposit) || 0,
        p_phone: input.phone?.trim() || null,
        p_telegram_username: normalizeTelegram(input.telegram_username) || null,
        p_battery_config: input.battery_config || null,
        p_discount_amount: 0
    });

    if (error) throw error;
    return { slug };
}

export async function setTenantArchived(id: string, archived: boolean): Promise<void> {
    const { error } = await supabase.rpc('set_tenant_archived', {
        p_tenant_id: id,
        p_archived: archived
    });

    if (error) throw error;
}

export async function deleteTenant(id: string): Promise<void> {
    const { error } = await supabase.rpc('delete_tenant_with_relations', { p_tenant_id: id });
    if (error) throw error;
}

export async function finishTenantRental(tenantId: string, input: { end_date: string; final_amount: number; reason: string }): Promise<void> {
    const { error } = await supabase.rpc('finish_tenant_rental', {
        p_tenant_id: tenantId,
        p_end_date: input.end_date,
        p_final_amount: input.final_amount,
        p_reason: input.reason.trim(),
    });
    if (error) throw error;
}

export async function updateFinishedTenantRental(eventId: string, input: { end_date: string; final_amount: number; reason: string }): Promise<void> {
    const { error } = await supabase.rpc('update_finished_tenant_rental', {
        p_event_id: eventId,
        p_end_date: input.end_date,
        p_final_amount: input.final_amount,
        p_reason: input.reason.trim(),
    });
    if (error) throw error;
}

export async function deleteTenantRecord(record: DeletableRecord, tenantId?: string): Promise<void> {
    if (record.type === 'charge') {
        if (!tenantId) throw new Error('Tenant id is required to delete a charge');
        const { error } = await supabase.rpc('delete_tenant_charge', {
            p_tenant_id: tenantId,
            p_charge_id: record.id,
        });
        if (error) throw error;
        return;
    }

    const table = record.type === 'adjustment'
        ? 'tenant_payment_adjustments'
        : 'payments';
    const request = tenantId
        ? supabase.from(table).delete().eq('id', record.id).eq('tenant_id', tenantId)
        : supabase.from(table).delete().eq('id', record.id);
    const { error } = await request;
    if (error) throw error;
}

export async function saveCharge(
    tenantId: string,
    charge: PaymentCharge | null,
    payload: Pick<PaymentCharge, 'amount' | 'due_date' | 'period_start' | 'period_end' | 'comment' | 'status'>
): Promise<void> {
    const { error } = await supabase.rpc('save_tenant_charge', {
        p_tenant_id: tenantId,
        p_charge_id: charge?.id || null,
        p_amount: Number(payload.amount),
        p_due_date: payload.due_date,
        p_period_start: payload.period_start || payload.due_date,
        p_period_end: payload.period_end || payload.due_date,
        p_comment: payload.comment?.trim() || null,
        p_status: payload.status || 'open',
    });
    if (error) throw error;
}

export async function saveAdjustment(
    tenantId: string,
    adjustment: PaymentAdjustment | null,
    payload: Pick<PaymentAdjustment, 'direction' | 'amount' | 'balance_override' | 'adjustment_date' | 'comment'>
): Promise<void> {
    const normalizedPayload = {
        ...payload,
        amount: Number(payload.amount),
        balance_override: payload.balance_override == null ? null : Number(payload.balance_override),
        comment: payload.comment || '',
    };
    const adjustmentId = adjustment?.id;
    if (adjustment && !adjustmentId) throw new Error('Adjustment id is required when editing an adjustment');
    const request = adjustmentId
        ? supabase.from('tenant_payment_adjustments').update(normalizedPayload).eq('id', adjustmentId)
        : supabase.from('tenant_payment_adjustments').insert({ ...normalizedPayload, tenant_id: tenantId });
    const { error } = await request;
    if (error) throw error;
}

export async function savePayment(tenantId: string, payment: PaymentEditorValue | null, amount: number, date: string, comment: string): Promise<void> {
    if (payment?.isExpected) {
        const { error } = await supabase.rpc('update_tenant_expected_payment', {
            p_tenant_id: tenantId,
            p_due_date: date,
            p_amount: amount,
            p_comment: comment || null
        });
        if (error) throw error;
        return;
    }

    if (payment?.id) {
        const { error } = await supabase
            .from('payments')
            .update({ amount, payment_date: date, comment: comment || null })
            .eq('id', payment.id)
            .eq('tenant_id', tenantId);
        if (error) throw error;
        return;
    }

    const { error } = await supabase.rpc('record_tenant_payment', {
        p_tenant_id: tenantId,
        p_amount: amount,
        p_payment_date: date,
        p_comment: comment || null
    });
    if (error) throw error;
}

function normalizeTelegram(value: string | null | undefined): string {
    return (value || '')
        .trim()
        .replace(/^https?:\/\/t\.me\//i, '')
        .replace(/^@/, '');
}
