import { supabase } from '../../lib/supabase';
import type { Credit, CreditTransaction } from '../../types';

export async function fetchCredits(): Promise<{ credits: Credit[]; transactions: CreditTransaction[] }> {
    const [{ data: credits, error: creditsError }, { data: transactions, error: transactionsError }] = await Promise.all([
        supabase.from('credits').select('*').order('created_at', { ascending: false }),
        supabase.from('credit_transactions').select('*').order('transaction_date', { ascending: true })
    ]);

    if (creditsError) throw creditsError;
    if (transactionsError) throw transactionsError;

    return {
        credits: (credits || []) as Credit[],
        transactions: (transactions || []) as CreditTransaction[]
    };
}

export type CreditInput = Omit<Credit, 'id'>;

export async function saveCredit(id: string | undefined, input: CreditInput): Promise<void> {
    const request = id
        ? supabase.from('credits').update(input).eq('id', id)
        : supabase.from('credits').insert([input]);
    const { error } = await request;
    if (error) throw error;
}

export async function deleteCredit(id: string): Promise<void> {
    const { error } = await supabase.from('credits').delete().eq('id', id);
    if (error) throw error;
}

export type CreditTransactionInput = Omit<CreditTransaction, 'id'>;

export async function saveCreditTransaction(id: string | undefined, input: CreditTransactionInput): Promise<void> {
    const request = id
        ? supabase.from('credit_transactions').update(input).eq('id', id)
        : supabase.from('credit_transactions').insert([input]);
    const { error } = await request;
    if (error) throw error;
}

export async function deleteCreditTransaction(id: string): Promise<void> {
    const { error } = await supabase.from('credit_transactions').delete().eq('id', id);
    if (error) throw error;
}
