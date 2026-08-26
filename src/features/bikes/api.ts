import { supabase } from '../../lib/supabase';
import { normalizeBikeStatus, type Bike, type BikeStatus } from '../../types';

export interface BikeTenant {
    id: string;
    name: string;
    bike_id: string | null;
}

export interface BikeInput {
    model: string;
    type: string;
    status: BikeStatus;
}

export async function fetchInventory(): Promise<Bike[]> {
    const { data, error } = await supabase
        .from('bikes')
        .select('id, model, type, status, voice_code')
        .order('model');

    if (error) throw error;
    return (data || []).map((bike) => ({
        id: bike.id,
        model: bike.model,
        type: bike.type,
        status: normalizeBikeStatus(bike.status),
        voice_code: bike.voice_code,
    }));
}

export async function fetchBikeTenants(): Promise<BikeTenant[]> {
    const { data, error } = await supabase.from('tenants').select('id, name, bike_id');
    if (error) throw error;
    return (data || []).map((tenant) => ({
        id: tenant.id,
        name: tenant.name,
        bike_id: tenant.bike_id,
    }));
}

export async function saveBike(id: string | undefined, input: BikeInput): Promise<void> {
    const response = id
        ? await supabase.rpc('update_bike_inventory', {
            p_bike_id: id,
            p_model: input.model,
            p_type: input.type,
            p_status: input.status
        })
        : await supabase.from('bikes').insert([{ ...input, voice_code: '' }]);

    if (response.error) throw response.error;
}

export async function deleteBike(id: string): Promise<void> {
    const { error } = await supabase.from('bikes').delete().eq('id', id);
    if (error) throw error;
}
