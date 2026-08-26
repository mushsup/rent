import { createClient } from 'npm:@supabase/supabase-js@2';
import { googlePayload } from '../_shared/googleTasks.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!;
const webhookUrl = Deno.env.get('GOOGLE_TASKS_WEBHOOK_URL');
const webhookSecret = Deno.env.get('GOOGLE_TASKS_WEBHOOK_SECRET');
const taskListTitle = Deno.env.get('GOOGLE_TASKS_LIST_TITLE') || 'E-Bike';
const serviceClient = createClient(supabaseUrl, serviceRoleKey);

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

async function requireUser(request: Request) {
  const authorization = request.headers.get('Authorization');
  if (!authorization) return null;
  const userClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authorization } },
  });
  const { data, error } = await userClient.auth.getUser();
  return error ? null : data.user;
}

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (request.method !== 'POST') return json({ error: 'Method not allowed' }, 405);

  try {
    const user = await requireUser(request);
    if (!user) return json({ error: 'Unauthorized' }, 401);
    if (!webhookUrl || !webhookSecret) {
      return json({ ok: false, queued: false, warning: 'Google Tasks webhook is not configured yet' });
    }

    const body = await request.json();
    if (!body.taskId) return json({ error: 'taskId is required' }, 400);
    const { data: task, error: taskError } = await serviceClient
      .from('bike_tasks')
      .select('id, title, description, status, priority, due_date, external_id, deleted_at, bike:bikes(id, model, voice_code)')
      .eq('id', body.taskId)
      .maybeSingle();
    if (taskError) throw taskError;
    if (!task) return json({ error: 'Task not found' }, 404);

    const bike = Array.isArray(task.bike) ? task.bike[0] || null : task.bike;
    const payload = task.deleted_at ? null : googlePayload({ ...task, bike });
    const webhookBody = {
        action: task.deleted_at ? 'delete' : 'push',
        secret: webhookSecret,
        taskListTitle,
        siteTaskId: task.id,
        externalId: task.external_id,
        payload,
    };
    // Apps Script redirects POST responses to a googleusercontent URL where
    // only GET is accepted, so send the webhook payload as an encoded query.
    const response = await fetch(`${webhookUrl}?request=${encodeURIComponent(JSON.stringify(webhookBody))}`, {
      method: 'GET',
      headers: { 'x-webhook-secret': webhookSecret },
    });
    const result = await response.json().catch(() => ({}));
    if (!response.ok) return json({ error: result.error || `Google Tasks webhook returned ${response.status}` }, 502);

    if (task.deleted_at) {
      const { error } = await serviceClient.from('bike_tasks').delete().eq('id', task.id);
      if (error) throw error;
      return json({ ok: true, action: 'delete' });
    }
    if (result.externalId) {
      const now = new Date().toISOString();
      const { error } = await serviceClient.from('bike_tasks').update({
        external_id: result.externalId,
        external_list_id: result.externalListId || null,
        external_updated_at: result.externalUpdatedAt || now,
        last_synced_at: now,
      }).eq('id', task.id);
      if (error) throw error;
    }
    return json({ ok: true, action: task.external_id ? 'update' : 'create', ...result });
  } catch (error) {
    console.error(error);
    return json({ error: error instanceof Error ? error.message : 'Unknown push error' }, 500);
  }
});
