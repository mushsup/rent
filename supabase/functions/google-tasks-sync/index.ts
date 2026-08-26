import { createClient } from 'npm:@supabase/supabase-js@2';
import { googlePayload, parseGoogleTask, type GoogleTaskInput } from '../_shared/googleTasks.ts';

type GoogleTask = GoogleTaskInput;

type Bike = {
  id: string;
  model: string | null;
  voice_code: string;
};

type DbTask = {
  id: string;
  bike_id: string | null;
  title: string;
  description: string | null;
  status: 'open' | 'in_progress' | 'done';
  priority: 'low' | 'normal' | 'high';
  due_date: string | null;
  source: 'site' | 'google_tasks';
  external_id: string | null;
  external_list_id: string | null;
  external_updated_at: string | null;
  last_synced_at: string | null;
  updated_at: string;
  deleted_at: string | null;
  bike?: Bike | null;
};

type BikeRelation = Bike | Bike[] | null;

function normalizeBikeRelation(value: BikeRelation | undefined): Bike | null {
  return Array.isArray(value) ? value[0] || null : value || null;
}

type SyncResult = {
  action: 'create' | 'update' | 'delete';
  siteTaskId: string;
  externalId?: string;
  externalUpdatedAt?: string;
};

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'content-type, x-sync-secret',
};

const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const expectedSecret = Deno.env.get('GOOGLE_TASKS_SYNC_SECRET');
const supabase = createClient(supabaseUrl, serviceRoleKey);

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

function changedAfterSync(task: DbTask) {
  if (!task.last_synced_at) return true;
  return new Date(task.updated_at).getTime() > new Date(task.last_synced_at).getTime() + 2000;
}

async function loadState() {
  const [bikesResponse, tasksResponse] = await Promise.all([
    supabase.from('bikes').select('id, model, voice_code'),
    supabase
      .from('bike_tasks')
      .select('id, bike_id, title, description, status, priority, due_date, source, external_id, external_list_id, external_updated_at, last_synced_at, updated_at, deleted_at, bike:bikes(id, model, voice_code)'),
  ]);
  if (bikesResponse.error) throw bikesResponse.error;
  if (tasksResponse.error) throw tasksResponse.error;
  return {
    bikes: (bikesResponse.data || []).map((bike) => ({
      id: bike.id,
      model: bike.model,
      voice_code: bike.voice_code,
    })),
    tasks: (tasksResponse.data || []).map((task) => ({
      ...task,
      bike: normalizeBikeRelation(task.bike),
    })) as DbTask[],
  };
}

async function syncSnapshot(taskListId: string, googleTasks: GoogleTask[]) {
  const { bikes, tasks } = await loadState();
  const byExternalId = new Map(
    tasks
      .filter((task) => task.external_list_id === taskListId && task.external_id)
      .map((task) => [task.external_id!, task]),
  );
  const operations: Array<Record<string, unknown>> = [];
  const warnings: string[] = [];
  const operationTaskIds = new Set<string>();
  const processedTaskIds = new Set<string>();
  const now = new Date().toISOString();

  for (const googleTask of googleTasks) {
    if (!googleTask.id) continue;
    const existing = byExternalId.get(googleTask.id);

    if (!existing) {
      if (googleTask.deleted) continue;
      const parsed = parseGoogleTask(googleTask, bikes);
      const { data, error } = await supabase.from('bike_tasks').insert({
        ...parsed,
        source: 'google_tasks',
        external_id: googleTask.id,
        external_list_id: taskListId,
        external_updated_at: googleTask.updated || now,
        last_synced_at: now,
      }).select('id').single();
      if (error) throw error;
      if (!parsed.bike_id) warnings.push(`Не распознан велосипед для «${googleTask.title || data.id}»`);
      continue;
    }

    processedTaskIds.add(existing.id);
    const siteChanged = changedAfterSync(existing);
    const googleUpdated = new Date(googleTask.updated || 0).getTime();
    const observedGoogleUpdated = new Date(existing.external_updated_at || 0).getTime();
    const googleChanged = googleUpdated > observedGoogleUpdated + 1000;

    if (googleTask.deleted) {
      if (siteChanged && !existing.deleted_at) {
        operations.push({ action: 'create', siteTaskId: existing.id, payload: googlePayload(existing) });
        operationTaskIds.add(existing.id);
      } else {
        const { error } = await supabase.from('bike_tasks').delete().eq('id', existing.id);
        if (error) throw error;
      }
      continue;
    }

    const siteUpdated = new Date(existing.updated_at).getTime();
    if (googleChanged && (!siteChanged || googleUpdated >= siteUpdated)) {
      const parsed = parseGoogleTask(googleTask, bikes, existing);
      const { error } = await supabase.from('bike_tasks').update({
        ...parsed,
        deleted_at: null,
        external_updated_at: googleTask.updated || now,
        last_synced_at: now,
      }).eq('id', existing.id);
      if (error) throw error;
      if (!parsed.bike_id) warnings.push(`Не распознан велосипед для «${googleTask.title || existing.id}»`);
    } else if (siteChanged) {
      operations.push({
        action: existing.deleted_at ? 'delete' : 'update',
        siteTaskId: existing.id,
        externalId: existing.external_id,
        payload: existing.deleted_at ? undefined : googlePayload(existing),
      });
      operationTaskIds.add(existing.id);
    }
  }

  for (const task of tasks) {
    if (operationTaskIds.has(task.id) || processedTaskIds.has(task.id)) continue;

    if (task.deleted_at) {
      if (task.external_id && task.external_list_id === taskListId) {
        operations.push({ action: 'delete', siteTaskId: task.id, externalId: task.external_id });
      } else if (!task.external_id) {
        const { error } = await supabase.from('bike_tasks').delete().eq('id', task.id);
        if (error) throw error;
      }
      continue;
    }

    if (!task.external_id) {
      operations.push({ action: 'create', siteTaskId: task.id, payload: googlePayload(task) });
    } else if (task.external_list_id === taskListId && changedAfterSync(task)) {
      operations.push({
        action: 'update',
        siteTaskId: task.id,
        externalId: task.external_id,
        payload: googlePayload(task),
      });
    }
  }

  return { operations, warnings };
}

async function acknowledge(results: SyncResult[], taskListId: string) {
  const now = new Date().toISOString();
  for (const result of results) {
    if (result.action === 'delete') {
      const { error } = await supabase.from('bike_tasks').delete().eq('id', result.siteTaskId);
      if (error) throw error;
      continue;
    }
    const { error } = await supabase.from('bike_tasks').update({
      external_id: result.externalId,
      external_list_id: taskListId,
      external_updated_at: result.externalUpdatedAt || now,
      last_synced_at: now,
    }).eq('id', result.siteTaskId);
    if (error) throw error;
  }
  return { acknowledged: results.length };
}

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (request.method !== 'POST') return json({ error: 'Method not allowed' }, 405);
  if (!expectedSecret || request.headers.get('x-sync-secret') !== expectedSecret) {
    return json({ error: 'Unauthorized' }, 401);
  }

  try {
    const body = await request.json();
    if (!body.taskListId) return json({ error: 'taskListId is required' }, 400);
    if (body.action === 'sync') {
      return json(await syncSnapshot(body.taskListId, Array.isArray(body.tasks) ? body.tasks : []));
    }
    if (body.action === 'ack') {
      return json(await acknowledge(Array.isArray(body.results) ? body.results : [], body.taskListId));
    }
    return json({ error: 'Unknown action' }, 400);
  } catch (error) {
    console.error(error);
    return json({ error: error instanceof Error ? error.message : 'Unknown sync error' }, 500);
  }
});
