import { supabase } from '../../lib/supabase';
import { normalizeBikeStatus, type BikeTask, type BikeTaskPriority, type BikeTaskStatus } from '../../types';

export interface BikeTaskInput {
  bike_id: string | null;
  title: string;
  description: string;
  status: BikeTaskStatus;
  priority: BikeTaskPriority;
  due_date: string | null;
}

export async function fetchBikeTasks(bikeId?: string): Promise<BikeTask[]> {
  let query = supabase
    .from('bike_tasks')
    .select('id, bike_id, title, description, status, priority, due_date, created_at, completed_at, source, external_id, external_updated_at, last_synced_at, updated_at, bike:bikes(id, model, type, status, voice_code)')
    .is('deleted_at', null);

  if (bikeId) query = query.eq('bike_id', bikeId);

  const { data, error } = await query
    .order('status')
    .order('due_date', { ascending: true, nullsFirst: false });

  if (error) throw error;
  return (data || []).map((task) => ({
    ...task,
    status: normalizeTaskStatus(task.status),
    priority: normalizeTaskPriority(task.priority),
    source: normalizeTaskSource(task.source),
    bike: task.bike ? { ...task.bike, status: normalizeBikeStatus(task.bike.status) } : null,
  }));
}

function normalizeTaskStatus(value: string): BikeTaskStatus {
  return value === 'in_progress' || value === 'done' ? value : 'open';
}

function normalizeTaskPriority(value: string): BikeTaskPriority {
  return value === 'low' || value === 'high' ? value : 'normal';
}

function normalizeTaskSource(value: string): BikeTask['source'] {
  return value === 'google_tasks' ? value : 'site';
}

export async function saveBikeTask(id: string | undefined, input: BikeTaskInput): Promise<void> {
  const payload = {
    ...input,
    completed_at: input.status === 'done' ? new Date().toISOString() : null,
  };
  let taskId = id;
  if (id) {
    const response = await supabase.from('bike_tasks').update(payload).eq('id', id);
    if (response.error) throw response.error;
  } else {
    const response = await supabase.from('bike_tasks').insert(payload).select('id').single();
    if (response.error) throw response.error;
    taskId = response.data.id;
  }

  if (import.meta.env.PROD && taskId) {
    const { data: pushResult, error: pushError } = await supabase.functions.invoke('google-tasks-push', { body: { taskId } });
    if (pushError) throw pushError;
    if (pushResult?.warning) throw new Error(`Google Tasks: ${pushResult.warning}`);
  }
}

export async function deleteBikeTask(id: string): Promise<void> {
  const { error } = await supabase
    .from('bike_tasks')
    .update({ deleted_at: new Date().toISOString() })
    .eq('id', id);
  if (error) throw error;
  if (import.meta.env.PROD) {
    const { data: pushResult, error: pushError } = await supabase.functions.invoke('google-tasks-push', { body: { taskId: id } });
    if (pushError) throw pushError;
    if (pushResult?.warning) throw new Error(`Google Tasks: ${pushResult.warning}`);
  }
}

/** Повторно отправляет существующую задачу в Google Tasks. */
export async function pushBikeTask(id: string): Promise<void> {
  const { data, error } = await supabase.functions.invoke('google-tasks-push', { body: { taskId: id } });
  if (error) throw error;
  if (data?.warning) throw new Error(`Google Tasks: ${data.warning}`);
}
