import { supabase } from '../../lib/supabase';

export interface PaymentRequest {
    id: string;
    tenant_id: string;
    amount: number | string;
    payment_method: 'cash' | 'bank_transfer';
    status: 'pending' | 'approved' | 'rejected' | 'cancelled';
    client_note?: string | null;
    admin_note?: string | null;
    appointment_at?: string | null;
    requested_at: string;
    tenant?: { name?: string | null } | null;
}

function normalizePaymentRequestStatus(status: string): PaymentRequest['status'] {
    return status === 'approved' || status === 'rejected' || status === 'cancelled' ? status : 'pending';
}

export async function fetchPendingPaymentRequests(): Promise<PaymentRequest[]> {
    const { data, error } = await supabase.from('payment_requests').select('id, tenant_id, amount, payment_method, status, client_note, admin_note, appointment_at, requested_at, tenant:tenants(name)').eq('status', 'pending').order('requested_at', { ascending: true });
    if (error) throw error;
    return (data || []).map((item) => ({
        ...item,
        payment_method: item.payment_method === 'bank_transfer' ? 'bank_transfer' : 'cash',
        status: normalizePaymentRequestStatus(item.status),
        tenant: Array.isArray(item.tenant) ? item.tenant[0] || null : item.tenant,
    }));
}

export async function approvePaymentRequest(id: string, paymentDate: string, adminNote?: string): Promise<void> {
    const { error } = await supabase.rpc('approve_payment_request', {
        p_request_id: id,
        p_payment_date: paymentDate,
        p_admin_note: adminNote?.trim() || undefined,
    });
    if (error) throw error;
}

export async function rejectPaymentRequest(id: string, adminNote: string): Promise<void> {
    const { error } = await supabase.rpc('reject_payment_request', { p_request_id: id, p_admin_note: adminNote });
    if (error) throw error;
}
