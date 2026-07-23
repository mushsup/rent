import { supabase } from '../../lib/supabase';
import type { Bike, DeletableRecord, PaymentAdjustment, PaymentEditorValue, Tenant, TenantDetail, TenantEditForm } from '../../types';

const TENANT_DETAIL_SELECT = [
    'id',
    'name',
    'slug',
    'bike_id',
    'is_archived',
    'phone',
    'telegram_username',
    'next_payment_date',
    'next_payment_amount',
    'next_payment_comment',
    'weekly_payment',
    'payment_day',
    'deposit',
    'admin_comment',
    'payments(id, amount, payment_date, comment, created_at)',
    'payment_terms:tenant_payment_terms(id, weekly_payment, payment_day, effective_from, effective_to)',
    'payment_charges:tenant_payment_charges(id, due_date, amount, comment, status, is_automatic, created_at)',
    'payment_adjustments:tenant_payment_adjustments(id, direction, amount, adjustment_date, comment, created_at)',
    'bikes(id, model, type, status)'
].join(', ');

function normalizeTenant(data: unknown): TenantDetail | null {
    if (!data) return null;

    const tenant = data as TenantDetail;
    return {
        ...tenant,
        bikes: Array.isArray(tenant.bikes) ? tenant.bikes[0] || null : tenant.bikes,
        payments: [...(tenant.payments || [])].sort(
            (left, right) => new Date(right.payment_date).getTime() - new Date(left.payment_date).getTime()
        )
    };
}

export async function fetchBikes(): Promise<Bike[]> {
    const { data, error } = await supabase
        .from('bikes')
        .select('id, model, type, status')
        .order('model');

    if (error) throw error;
    return (data || []) as Bike[];
}

export async function fetchTenantDetail(id: string): Promise<TenantDetail | null> {
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

export async function fetchDashboardTenants(showArchived: boolean): Promise<Tenant[]> {
    const select = [
        'id',
        'name',
        'slug',
        'bike_id',
        'is_archived',
        'next_payment_date',
        'next_payment_amount',
        'weekly_payment',
        'payment_day',
        'payments(id, amount, payment_date, created_at)',
        'payment_terms:tenant_payment_terms(id, weekly_payment, payment_day, effective_from, effective_to)',
        'payment_charges:tenant_payment_charges(id, due_date, amount, comment, status, is_automatic, created_at)',
        'payment_adjustments:tenant_payment_adjustments(id, direction, amount, adjustment_date, created_at)',
        'bikes(id, model, type, status)'
    ].join(', ');

    const { data, error } = await supabase
        .from('tenants')
        .select(select)
        .eq('is_archived', showArchived)
        .order('name');

    if (error) throw error;

    const rows = (data || []) as unknown as Array<Record<string, unknown>>;
    return rows.map((tenant) => ({
        ...tenant,
        bikes: Array.isArray(tenant.bikes) ? tenant.bikes[0] || null : tenant.bikes
    })) as Tenant[];
}

export async function updateTenantProfile(id: string, form: TenantEditForm): Promise<void> {
    const { error: profileError } = await supabase.rpc('update_tenant_profile', {
        p_tenant_id: id,
        p_name: form.name,
        p_slug: form.slug.toLowerCase().trim().replace(/[^a-z0-9-]/g, '-'),
        p_bike_id: form.bike_id || null,
        p_weekly_payment: Number(form.weekly_payment) || 0,
        p_payment_day: Number(form.payment_day),
        p_next_payment_date: form.next_payment_date,
        p_deposit: Number(form.deposit) || 0,
        p_admin_comment: form.admin_comment || null
    });

    if (profileError) throw profileError;

    const { error: contactsError } = await supabase
        .from('tenants')
        .update({
            phone: form.phone?.trim() || null,
            telegram_username: normalizeTelegram(form.telegram_username) || null
        })
        .eq('id', id);

    if (contactsError) throw contactsError;
}

export interface NewTenantInput {
    name: string;
    slug: string;
    bike_id: string;
    weekly_payment: number | string;
    payment_day: number | string;
    next_payment_date: string;
    deposit: number | string;
    phone?: string;
    telegram_username?: string;
}

export async function createTenant(input: NewTenantInput): Promise<void> {
    const { error } = await supabase.rpc('create_tenant_with_rental', {
        p_name: input.name,
        p_slug: input.slug.toLowerCase().trim().replace(/[^a-z0-9-]/g, '-'),
        p_bike_id: input.bike_id || null,
        p_weekly_payment: Number(input.weekly_payment) || 0,
        p_payment_day: Number(input.payment_day),
        p_first_payment_date: input.next_payment_date,
        p_deposit: Number(input.deposit) || 0,
        p_phone: input.phone?.trim() || null,
        p_telegram_username: normalizeTelegram(input.telegram_username) || null
    });

    if (error) throw error;
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

export async function deleteTenantRecord(record: DeletableRecord): Promise<void> {
    const table = record.type === 'adjustment' ? 'tenant_payment_adjustments' : 'payments';
    const { error } = await supabase.from(table).delete().eq('id', record.id);
    if (error) throw error;
}

export async function saveAdjustment(
    tenantId: string,
    adjustment: PaymentAdjustment | null,
    payload: Pick<PaymentAdjustment, 'direction' | 'amount' | 'adjustment_date' | 'comment'>
): Promise<void> {
    const request = adjustment
        ? supabase.from('tenant_payment_adjustments').update(payload).eq('id', adjustment.id)
        : supabase.from('tenant_payment_adjustments').insert({ ...payload, tenant_id: tenantId });
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
            .eq('id', payment.id);
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
