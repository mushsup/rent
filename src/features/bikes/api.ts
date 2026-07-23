import { supabase } from '../../lib/supabase';
import type { Bike } from '../../types';

export interface BikeTenant {
    id: string;
    name: string;
    bike_id: string | null;
}

export interface BikeInput {
    model: string;
    type: string;
    status: string;
}

export async function fetchInventory(): Promise<Bike[]> {
    const { data, error } = await supabase
        .from('bikes')
        .select('id, model, type, status')
        .order('model');

    if (error) throw error;
    return (data || []) as Bike[];
}

export async function fetchBikeTenants(): Promise<BikeTenant[]> {
    const { data, error } = await supabase.from('tenants').select('id, name, bike_id');
    if (error) throw error;
    return (data || []) as BikeTenant[];
}

export async function saveBike(id: string | undefined, input: BikeInput): Promise<void> {
    const response = id
        ? await supabase.rpc('update_bike_inventory', {
            p_bike_id: id,
            p_model: input.model,
            p_type: input.type,
            p_status: input.status
        })
        : await supabase.from('bikes').insert([input]);

    if (response.error) throw response.error;
}

export async function deleteBike(id: string): Promise<void> {
    const { error } = await supabase.from('bikes').delete().eq('id', id);
    if (error) throw error;
}
