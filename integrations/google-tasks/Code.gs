const DEFAULT_TASK_LIST_TITLE = 'E-Bike';
const SYNC_INTERVAL_MINUTES = 1;

function syncNow() {
  const config = getConfiguration_();
  const taskList = getOrCreateTaskList_(config.taskListTitle);
  const googleTasks = listAllTasks_(taskList.id);
  const syncResponse = callSyncEndpoint_(config, {
    action: 'sync',
    taskListId: taskList.id,
    tasks: googleTasks,
  });

  const results = [];
  (syncResponse.operations || []).forEach(function (operation) {
    try {
      const result = applyOperation_(taskList.id, operation);
      if (result) results.push(result);
    } catch (error) {
      console.error('Не удалось применить операцию', operation, error);
    }
  });

  if (results.length > 0) {
    callSyncEndpoint_(config, {
      action: 'ack',
      taskListId: taskList.id,
      results: results,
    });
  }

  (syncResponse.warnings || []).forEach(function (warning) {
    console.warn(warning);
  });
  console.log('Синхронизация завершена. Операций: ' + results.length);
}

function doPost(event) {
  try {
    return processWebhook_(JSON.parse(event.postData.contents || '{}'));
  } catch (error) {
    console.error(error);
    return jsonResponse_({ error: String(error) }, 500);
  }
}

// Apps Script redirects ContentService POST responses to a googleusercontent
// URL that only accepts GET. The edge function uses this GET fallback.
function doGet(event) {
  try {
    const encoded = event && event.parameter && event.parameter.request;
    if (!encoded) return jsonResponse_({ error: 'Invalid push request' }, 400);
    return processWebhook_(JSON.parse(encoded));
  } catch (error) {
    console.error(error);
    return jsonResponse_({ error: String(error) }, 500);
  }
}

function processWebhook_(body) {
  const config = getConfiguration_();
  if (body.secret !== config.webhookSecret) return jsonResponse_({ error: 'Unauthorized' }, 401);

  const taskList = getOrCreateTaskList_(body.taskListTitle || config.taskListTitle);
  if (body.action === 'delete') {
    if (body.externalId) {
      try {
        Tasks.Tasks.remove(taskList.id, body.externalId);
      } catch (error) {
        if (!String(error).includes('404')) throw error;
      }
    }
    return jsonResponse_({ ok: true, action: 'delete', externalListId: taskList.id });
  }
  if (body.action !== 'push' || !body.payload) return jsonResponse_({ error: 'Invalid push request' }, 400);

  const result = applyOperation_(taskList.id, {
    action: body.externalId ? 'update' : 'create',
    siteTaskId: body.siteTaskId,
    externalId: body.externalId,
    payload: body.payload,
  });
  return jsonResponse_({ ok: true, ...result, externalListId: taskList.id });
}

function jsonResponse_(body, status) {
  return ContentService.createTextOutput(JSON.stringify(body))
    .setMimeType(ContentService.MimeType.JSON);
}

function installSyncTrigger() {
  ScriptApp.getProjectTriggers()
    .filter(function (trigger) { return trigger.getHandlerFunction() === 'syncNow'; })
    .forEach(function (trigger) { ScriptApp.deleteTrigger(trigger); });

  ScriptApp.newTrigger('syncNow')
    .timeBased()
    .everyMinutes(SYNC_INTERVAL_MINUTES)
    .create();

  syncNow();
  console.log('Триггер установлен: синхронизация каждую минуту.');
}

function removeSyncTrigger() {
  ScriptApp.getProjectTriggers()
    .filter(function (trigger) { return trigger.getHandlerFunction() === 'syncNow'; })
    .forEach(function (trigger) { ScriptApp.deleteTrigger(trigger); });
}

function getConfiguration_() {
  const properties = PropertiesService.getScriptProperties();
  const functionUrl = properties.getProperty('SUPABASE_FUNCTION_URL');
  const syncSecret = properties.getProperty('SYNC_SECRET');
  const webhookSecret = properties.getProperty('WEBHOOK_SECRET') || syncSecret;
  const taskListTitle = properties.getProperty('TASK_LIST_TITLE') || DEFAULT_TASK_LIST_TITLE;

  if (!functionUrl || !syncSecret) {
    throw new Error(
      'Добавьте SUPABASE_FUNCTION_URL и SYNC_SECRET в Project Settings → Script properties.',
    );
  }
  return { functionUrl: functionUrl, syncSecret: syncSecret, webhookSecret: webhookSecret, taskListTitle: taskListTitle };
}

function getOrCreateTaskList_(title) {
  let pageToken;
  do {
    const response = Tasks.Tasklists.list({ maxResults: 100, pageToken: pageToken });
    const found = (response.items || []).find(function (list) { return list.title === title; });
    if (found) return found;
    pageToken = response.nextPageToken;
  } while (pageToken);

  return Tasks.Tasklists.insert({ title: title });
}

function listAllTasks_(taskListId) {
  const result = [];
  let pageToken;
  do {
    const response = Tasks.Tasks.list(taskListId, {
      maxResults: 100,
      pageToken: pageToken,
      showCompleted: true,
      showDeleted: true,
      showHidden: true,
    });
    (response.items || []).forEach(function (task) {
      result.push({
        id: task.id,
        title: task.title || '',
        notes: task.notes || '',
        status: task.status || 'needsAction',
        due: task.due || null,
        completed: task.completed || null,
        updated: task.updated || null,
        deleted: Boolean(task.deleted),
      });
    });
    pageToken = response.nextPageToken;
  } while (pageToken);
  return result;
}

function applyOperation_(taskListId, operation) {
  if (operation.action === 'delete') {
    try {
      Tasks.Tasks.remove(taskListId, operation.externalId);
    } catch (error) {
      if (!String(error).includes('404')) throw error;
    }
    return { action: 'delete', siteTaskId: operation.siteTaskId };
  }

  const payload = {
    title: operation.payload.title,
    notes: operation.payload.notes || '',
    status: operation.payload.status,
    due: operation.payload.due || null,
  };
  if (payload.status === 'completed') {
    payload.completed = new Date().toISOString();
  } else {
    payload.completed = null;
  }

  let googleTask;
  if (operation.action === 'create') {
    googleTask = Tasks.Tasks.insert(payload, taskListId);
  } else {
    try {
      googleTask = Tasks.Tasks.patch(payload, taskListId, operation.externalId);
    } catch (error) {
      if (!String(error).includes('404')) throw error;
      googleTask = Tasks.Tasks.insert(payload, taskListId);
    }
  }

  return {
    action: operation.action === 'create' ? 'create' : 'update',
    siteTaskId: operation.siteTaskId,
    externalId: googleTask.id,
    externalUpdatedAt: googleTask.updated,
  };
}

function callSyncEndpoint_(config, body) {
  const response = UrlFetchApp.fetch(config.functionUrl, {
    method: 'post',
    contentType: 'application/json',
    headers: { 'x-sync-secret': config.syncSecret },
    payload: JSON.stringify(body),
    muteHttpExceptions: true,
  });
  const status = response.getResponseCode();
  const text = response.getContentText();
  if (status < 200 || status >= 300) {
    throw new Error('Supabase sync error ' + status + ': ' + text);
  }
  return JSON.parse(text);
}
