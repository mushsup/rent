import { supabase } from '../../lib/supabase';
import { normalizeCreditTransactionType, normalizeCreditType, type Credit, type CreditTransaction } from '../../types';

export async function fetchCredits(): Promise<{ credits: Credit[]; transactions: CreditTransaction[] }> {
    const [{ data: credits, error: creditsError }, { data: transactions, error: transactionsError }] = await Promise.all([
        supabase.from('credits').select('id, name, start_date, type, amount, interest_rate, payment_day, payment_amount').order('created_at', { ascending: false }),
        supabase.from('credit_transactions').select('id, credit_id, type, amount, transaction_date').order('transaction_date', { ascending: true })
    ]);

    if (creditsError) throw creditsError;
    if (transactionsError) throw transactionsError;

    return {
        credits: (credits || []).map((credit) => ({
            ...credit,
            type: normalizeCreditType(credit.type),
        })),
        transactions: (transactions || []).map((transaction) => ({
            ...transaction,
            type: normalizeCreditTransactionType(transaction.type),
        }))
    };
}

export type CreditInput = Omit<Credit, 'id'>;

export async function saveCredit(id: string | undefined, input: CreditInput): Promise<void> {
    const payload = {
        ...input,
        amount: Number(input.amount),
        interest_rate: Number(input.interest_rate || 0),
        payment_day: Number(input.payment_day || 1),
        payment_amount: Number(input.payment_amount || 0),
    };
    const request = id
        ? supabase.from('credits').update(payload).eq('id', id)
        : supabase.from('credits').insert([payload]);
    const { error } = await request;
    if (error) throw error;
}

export async function deleteCredit(id: string): Promise<void> {
    const { error } = await supabase.from('credits').delete().eq('id', id);
    if (error) throw error;
}

export type CreditTransactionInput = Omit<CreditTransaction, 'id'>;

export async function saveCreditTransaction(id: string | undefined, input: CreditTransactionInput): Promise<void> {
    const payload = { ...input, amount: Number(input.amount) };
    const request = id
        ? supabase.from('credit_transactions').update(payload).eq('id', id)
        : supabase.from('credit_transactions').insert([payload]);
    const { error } = await request;
    if (error) throw error;
}

export async function deleteCreditTransaction(id: string): Promise<void> {
    const { error } = await supabase.from('credit_transactions').delete().eq('id', id);
    if (error) throw error;
}
