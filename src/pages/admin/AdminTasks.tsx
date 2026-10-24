import { useState, type FormEvent } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Edit2, Plus, RefreshCw, RotateCcw, Trash2 } from 'lucide-react';
import toast from 'react-hot-toast';
import { fetchInventory } from '../../features/bikes/api';
import { useBikeTasks, useDeleteBikeTask, usePushBikeTask, useSaveBikeTask, useToggleBikeTask } from '../../features/tasks/queries';
import { formatBikeLabel, formatDate } from '../../shared/lib/format';
import { BIKE_TASK_PRIORITY_LABELS as priorityLabels, BIKE_TASK_STATUS_LABELS as statusLabels } from '../../features/tasks/status';
import { queryKeys } from '../../shared/lib/queryKeys';
import { Badge, Button, Card, ConfirmDialog, Dialog, EmptyState, ErrorState, IconButton, Input, LoadingState, PageHeader, Select, StatusBadge, Textarea } from '../../shared/ui';
import type { Bike, BikeTask, BikeTaskPriority, BikeTaskStatus } from '../../types';
import { DateInput } from '../../shared/ui/DateInput';
import { useI18n } from '../../i18n';

export default function AdminTasks() {
  const { language, t } = useI18n();
  const [statusFilter, setStatusFilter] = useState<'all' | BikeTaskStatus>('all');
  const [bikeFilter, setBikeFilter] = useState('all');
  const [modalTask, setModalTask] = useState<BikeTask | null | undefined>();
  const [deletingTask, setDeletingTask] = useState<BikeTask | null>(null);
  const tasksQuery = useBikeTasks();
  const bikesQuery = useQuery<Bike[]>({ queryKey: queryKeys.bikes.all, queryFn: fetchInventory });
  const toggleTask = useToggleBikeTask();
  const deleteTask = useDeleteBikeTask();
  const pushTask = usePushBikeTask();

  const tasks = tasksQuery.data || [];
  const bikes = bikesQuery.data || [];
  const lastSyncedAt = tasks
    .map((task) => task.last_synced_at)
    .filter((value): value is string => Boolean(value))
    .sort()
    .slice(-1)[0];
  const filteredTasks = tasks.filter((task) =>
    (statusFilter === 'all' || task.status === statusFilter) &&
    (bikeFilter === 'all' || task.bike_id === bikeFilter),
  );
  const hasFilters = statusFilter !== 'all' || bikeFilter !== 'all';
  const resetFilters = () => { setStatusFilter('all'); setBikeFilter('all'); };

  const confirmDelete = async () => {
    if (!deletingTask) return;
    try {
      await deleteTask.mutateAsync(deletingTask.id);
      toast.success(t('Задача удалена'));
    } catch {
      // The mutation hook already shows the localized error toast.
    } finally {
      setDeletingTask(null);
    }
  };

  return <div className="space-y-6">
    <PageHeader
      title="Задачи"
      description="Техническое обслуживание и задачи по велосипедам"
      actions={<Button onClick={() => setModalTask(null)}><Plus className="h-4 w-4" /> {t('Новая задача')}</Button>}
    />
    <p className="text-xs text-slate-500 dark:text-slate-400">
      Google Tasks: {lastSyncedAt ? `${t('последняя синхронизация')} ${new Date(lastSyncedAt).toLocaleString(language === 'ru' ? 'ru-RU' : 'en-US')}` : t('синхронизация ещё не выполнялась')}
    </p>

    <div className="flex flex-col gap-3 sm:flex-row">
      <div className="flex flex-wrap gap-1 rounded-lg border border-slate-200 bg-slate-100 p-1 dark:border-slate-800 dark:bg-slate-900">
        {(['all', 'open', 'in_progress', 'done'] as const).map((status) => <button key={status} onClick={() => setStatusFilter(status)} className={`rounded-md px-3 py-1.5 text-xs font-medium transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-lime-500 ${statusFilter === status ? 'bg-white text-lime-800 shadow-sm dark:bg-slate-700 dark:text-lime-400' : 'text-slate-600 dark:text-slate-400'}`}>{status === 'all' ? t('Все') : t(statusLabels[status])}</button>)}
      </div>
      <Select aria-label={t('Фильтр по велосипеду')} value={bikeFilter} onChange={(event) => setBikeFilter(event.target.value)} className="sm:w-auto">
        <option value="all">{t('Все велосипеды')}</option>
        {bikes.map((bike) => <option key={bike.id} value={bike.id}>{formatBikeLabel(bike)}</option>)}
      </Select>
      {hasFilters && <Button variant="ghost" onClick={resetFilters} className="sm:w-auto"><RotateCcw className="h-4 w-4" /> {t('Сбросить фильтры')}</Button>}
    </div>

    {tasksQuery.isError && <ErrorState message={t('Не удалось загрузить задачи.')} retry={() => tasksQuery.refetch()} />}
    <Card>
      {tasksQuery.isLoading || bikesQuery.isLoading ? <LoadingState /> : filteredTasks.length === 0 ? <EmptyState title={tasks.length === 0 ? 'Задач пока нет' : 'Ничего не найдено'} action={tasks.length === 0 ? <Button variant="ghost" className="mt-3" onClick={() => setModalTask(null)}>{t('Создать первую задачу')}</Button> : <Button variant="ghost" className="mt-3" onClick={resetFilters}>{t('Сбросить фильтры')}</Button>} /> : <div className="divide-y divide-slate-100 dark:divide-slate-800">
        {filteredTasks.map((task) => <TaskRow key={task.id} task={task} toggling={toggleTask.isPending && toggleTask.variables?.id === task.id} syncing={pushTask.isPending && pushTask.variables === task.id} onToggle={() => toggleTask.mutate(task)} onEdit={() => setModalTask(task)} onDelete={() => setDeletingTask(task)} onSync={() => pushTask.mutate(task.id)} />)}
      </div>}
    </Card>

    <TaskDialog task={modalTask} bikes={bikes} open={modalTask !== undefined} onClose={() => setModalTask(undefined)} />
    <ConfirmDialog open={Boolean(deletingTask)} title={t('Удалить задачу?')} description={deletingTask ? t('Задача «{{title}}» будет удалена с сайта и при следующей синхронизации — из Google Tasks.', { title: deletingTask.title }) : ''} busy={deleteTask.isPending} onCancel={() => setDeletingTask(null)} onConfirm={confirmDelete} />
  </div>;
}

function TaskRow({ task, toggling, syncing, onToggle, onEdit, onDelete, onSync }: { task: BikeTask; toggling: boolean; syncing: boolean; onToggle: () => void; onEdit: () => void; onDelete: () => void; onSync: () => void }) {
  const { t } = useI18n();
  const statusTone = task.status === 'done' ? 'lime' : task.status === 'in_progress' ? 'slate' : 'amber';
  return <article className="flex flex-col gap-3 px-4 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-6">
    <div className="flex min-w-0 items-start gap-3">
      <input type="checkbox" checked={task.status === 'done'} disabled={toggling} onChange={onToggle} aria-label={`${t(task.status === 'done' ? 'Открыть' : 'Завершить')} ${t('задачу')}: ${task.title}`} className="mt-1 h-4 w-4 shrink-0 cursor-pointer accent-lime-600 focus-visible:ring-2 focus-visible:ring-lime-500" />
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2"><h2 className="font-semibold text-slate-900 dark:text-white">{task.title}</h2><StatusBadge tone={statusTone}>{t(statusLabels[task.status])}</StatusBadge><span className="text-xs font-medium text-slate-500 dark:text-slate-400">{t('Приоритет:')} {t(priorityLabels[task.priority])}</span></div>
        <div className="mt-1 flex flex-wrap items-center gap-2 text-sm"><span className={task.bike ? 'text-lime-800 dark:text-lime-400' : 'text-orange-700 dark:text-orange-400'}>{task.bike ? formatBikeLabel(task.bike) : t('Велосипед не выбран')}</span>{task.source === 'google_tasks' && <Badge className="bg-slate-200 text-slate-700 dark:bg-slate-800 dark:text-slate-300">Google Tasks</Badge>}</div>
        {task.description && <p className="mt-1 line-clamp-2 text-sm text-slate-600 dark:text-slate-400">{task.description}</p>}
        {task.due_date && <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">{t('Срок:')} {formatDate(task.due_date)}</p>}
      </div>
    </div>
    <div className="flex shrink-0 items-center gap-1"><IconButton label={`${t('Синхронизировать задачу с Google Tasks')}: ${task.title}`} onClick={onSync} disabled={syncing}><RefreshCw className={`h-4 w-4 ${syncing ? 'animate-spin' : ''}`} /></IconButton><IconButton label={`${t('Редактировать задачу')}: ${task.title}`} onClick={onEdit}><Edit2 className="h-4 w-4" /></IconButton><IconButton label={`${t('Удалить задачу')}: ${task.title}`} onClick={onDelete} className="hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-950/40"><Trash2 className="h-4 w-4" /></IconButton></div>
  </article>;
}

function TaskDialog({ task, bikes, open, onClose }: { task: BikeTask | null | undefined; bikes: Bike[]; open: boolean; onClose: () => void }) {
  const { t } = useI18n();
  return <Dialog open={open} title={t(task ? 'Редактировать задачу' : 'Новая задача')} onClose={onClose}>
    {open && <TaskForm key={task?.id || 'new'} task={task || null} bikes={bikes} onClose={onClose} />}
  </Dialog>;
}

function TaskForm({ task, bikes, onClose }: { task: BikeTask | null; bikes: Bike[]; onClose: () => void }) {
  const { t } = useI18n();
  const [form, setForm] = useState({ bike_id: task?.bike_id || bikes[0]?.id || '', title: task?.title || '', description: task?.description || '', status: task?.status || 'open' as BikeTaskStatus, priority: task?.priority || 'normal' as BikeTaskPriority, due_date: task?.due_date || '' });
  const saveTask = useSaveBikeTask();
  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!form.title.trim()) { toast.error(t('Укажите название задачи')); return; }
    try {
      await saveTask.mutateAsync({ id: task?.id, input: { ...form, bike_id: form.bike_id || null, title: form.title.trim(), due_date: form.due_date || null } });
      toast.success(t(task ? 'Задача обновлена' : 'Задача создана'));
      onClose();
    } catch {
      // The mutation hook already shows the localized error toast.
    }
  };

  return <form onSubmit={submit} className="space-y-4">
    <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">{t('Велосипед')}<Select required value={form.bike_id} onChange={(event) => setForm({ ...form, bike_id: event.target.value })} className="mt-1"><option value="">{t('Без велосипеда')}</option>{bikes.map((bike) => <option key={bike.id} value={bike.id}>{formatBikeLabel(bike)}</option>)}</Select></label>
    <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">{t('Название')}<Input required value={form.title} onChange={(event) => setForm({ ...form, title: event.target.value })} className="mt-1" /></label>
    <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">{t('Описание')}<Textarea rows={3} value={form.description} onChange={(event) => setForm({ ...form, description: event.target.value })} className="mt-1" /></label>
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
      <label className="text-sm font-medium text-slate-700 dark:text-slate-300">{t('Статус')}<Select value={form.status} onChange={(event) => setForm({ ...form, status: event.target.value as BikeTaskStatus })} className="mt-1">{Object.entries(statusLabels).map(([value, label]) => <option key={value} value={value}>{t(label)}</option>)}</Select></label>
      <label className="text-sm font-medium text-slate-700 dark:text-slate-300">{t('Приоритет')}<Select value={form.priority} onChange={(event) => setForm({ ...form, priority: event.target.value as BikeTaskPriority })} className="mt-1">{Object.entries(priorityLabels).map(([value, label]) => <option key={value} value={value}>{t(label)}</option>)}</Select></label>
      <label className="text-sm font-medium text-slate-700 dark:text-slate-300">{t('Срок')}<DateInput value={form.due_date} onChange={(value) => setForm({ ...form, due_date: value })} className="mt-1 block w-full" /></label>
    </div>
    <div className="flex justify-end gap-2 pt-2"><Button type="button" variant="secondary" onClick={onClose}>{t('Отмена')}</Button><Button disabled={saveTask.isPending} type="submit">{saveTask.isPending ? t('Сохранение…') : t('Сохранить')}</Button></div>
  </form>;
}
