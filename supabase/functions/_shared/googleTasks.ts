export type GoogleTaskInput = {
  id: string;
  title?: string;
  notes?: string;
  status?: 'needsAction' | 'completed';
  due?: string;
  completed?: string;
  updated?: string;
  deleted?: boolean;
};

export type SyncBike = {
  id: string;
  model: string | null;
  voice_code: string;
};

export type PreviousTask = {
  bike_id: string | null;
  status: 'open' | 'in_progress' | 'done';
  priority: 'low' | 'normal' | 'high';
};

export function normalizeVoiceCode(value: string): string | null {
  const match = value.toLowerCase().match(/\b([mf])[\s-]?(\d{1,6})\b/);
  return match ? `${match[1]}${Number(match[2])}` : null;
}

export function parseGoogleTask(task: GoogleTaskInput, bikes: SyncBike[], previous?: PreviousTask) {
  const searchable = `${task.title || ''}\n${task.notes || ''}`;
  const requestedCode = normalizeVoiceCode(searchable);
  const bike = requestedCode
    ? bikes.find((item) => item.voice_code.toLowerCase() === requestedCode)
    : bikes.find((item) => item.model && searchable.toLowerCase().includes(item.model.toLowerCase()));
  const priority = /(?:priority\s*:\s*high|высок(?:ий|ого)?\s+приоритет)/i.test(searchable)
    ? 'high'
    : /(?:priority\s*:\s*low|низк(?:ий|ого)?\s+приоритет)/i.test(searchable)
      ? 'low'
      : previous?.priority || 'normal';
  const title = (task.title || 'Задача из Google Tasks')
    .replace(/^\s*(?:\[|\()?\s*[mf][\s-]?\d{1,6}\s*(?:]|\))?[\s:—–-]*/i, '')
    .trim();
  const description = (task.notes || '')
    .split('\n')
    .filter((line) => !/^\s*(?:bike|priority|site task)\s*:/i.test(line))
    .join('\n')
    .trim();

  return {
    bike_id: bike?.id || previous?.bike_id || null,
    title,
    description,
    status: task.status === 'completed' ? 'done' : previous?.status === 'in_progress' ? 'in_progress' : 'open',
    priority,
    due_date: task.due ? task.due.slice(0, 10) : null,
    completed_at: task.status === 'completed' ? task.completed || new Date().toISOString() : null,
  } as const;
}

export function googlePayload(task: {
  id: string;
  title: string;
  description: string | null;
  status: 'open' | 'in_progress' | 'done';
  priority: 'low' | 'normal' | 'high';
  due_date: string | null;
  bike?: SyncBike | null;
}) {
  const code = task.bike?.voice_code;
  const metadata = [
    code ? `Bike: ${code}` : null,
    `Priority: ${task.priority}`,
    `Site task: ${task.id}`,
  ].filter(Boolean);

  return {
    title: code ? `[${code}] ${task.title}` : task.title,
    notes: [task.description?.trim(), metadata.join('\n')].filter(Boolean).join('\n\n'),
    status: task.status === 'done' ? 'completed' : 'needsAction',
    due: task.due_date ? `${task.due_date}T00:00:00.000Z` : null,
  };
}
