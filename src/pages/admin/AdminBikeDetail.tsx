import { useState, type FormEvent, type ReactNode } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, Edit2, Plus, Trash2, X } from 'lucide-react';
import toast from 'react-hot-toast';
import { deleteBike, fetchInventory, saveBike } from '../../features/bikes/api';
import { deleteBikeTask, fetchBikeTasks, saveBikeTask } from '../../features/tasks/api';
import { normalizeBikeStatus, type Bike, type BikeTask, type BikeTaskPriority, type BikeTaskStatus } from '../../types';
import { ConfirmDialog, EmptyState, ErrorState, LoadingState, StatusBadge } from '../../shared/ui';
import { formatDate } from '../../shared/lib/format';
import { queryKeys } from '../../shared/lib/queryKeys';
import { getErrorMessage } from '../../shared/lib/errors';
import { BIKE_STATUS_LABELS, getBikeStatusLabel } from '../../features/bikes/status';
import { BIKE_TASK_PRIORITY_LABELS as priorities, BIKE_TASK_STATUS_LABELS as taskStatuses } from '../../features/tasks/status';
import { DateInput } from '../../shared/ui/DateInput';
import { useI18n } from '../../i18n';

export default function AdminBikeDetail() {
    const { id } = useParams();
    const navigate = useNavigate();
    const queryClient = useQueryClient();
    const { t } = useI18n();
    const [editing, setEditing] = useState(false);
    const [taskFormOpen, setTaskFormOpen] = useState(false);
    const [editingTask, setEditingTask] = useState<BikeTask | null>(null);
    const [deleteBikeOpen, setDeleteBikeOpen] = useState(false);
    const [deletingTask, setDeletingTask] = useState<BikeTask | null>(null);
    const [savingBike, setSavingBike] = useState(false);
    const [deletingBike, setDeletingBike] = useState(false);
    const [deletingTaskBusy, setDeletingTaskBusy] = useState(false);

    const { data: bikes = [], isLoading: bikesLoading, isError: bikesError, error: bikesQueryError, refetch: refetchBikes } = useQuery<Bike[]>({ queryKey: queryKeys.bikes.all, queryFn: fetchInventory });
    const { data: tasks = [], isLoading: tasksLoading, isError: tasksError } = useQuery<BikeTask[]>({ queryKey: queryKeys.tasks.byBike(id!), queryFn: () => fetchBikeTasks(id), enabled: Boolean(id) });
    const bike = bikes.find((item) => item.id === id);
    const tenantName = bike?.assigned_tenant_name;

    if (bikesLoading) return <LoadingState label={t('Загрузка велосипеда…')} />;
    if (bikesError) return <div className="mx-auto max-w-5xl space-y-4 px-2 py-4 sm:px-6 sm:py-6"><ErrorState message={`${t('Не удалось загрузить велосипед.')} ${t(getErrorMessage(bikesQueryError))}`} retry={() => void refetchBikes()} /></div>;
    if (!bike) return <div className="mx-auto max-w-5xl space-y-4 px-2 py-4 sm:px-6 sm:py-6"><EmptyState title={t('Велосипед не найден')} action={<Link to="/bikes" className="text-sm font-medium text-lime-800 dark:text-lime-400">{t('Вернуться к списку')}</Link>} /></div>;

    const refresh = () => {
        queryClient.invalidateQueries({ queryKey: queryKeys.bikes.all });
        queryClient.invalidateQueries({ queryKey: queryKeys.tasks.all });
    };

    const handleSaveBike = async (event: FormEvent<HTMLFormElement>) => {
        event.preventDefault();
        if (!bike.id) { toast.error(t('У велосипеда отсутствует идентификатор')); return; }
        const form = new FormData(event.currentTarget);
        const model = String(form.get('model')).trim();
        if (!model) { toast.error(t('Укажите модель велосипеда')); return; }
        const newStatus = tenantName ? 'in_rent' : normalizeBikeStatus(String(form.get('status')));
        if (!tenantName && newStatus === 'in_rent') { toast.error(t('Нельзя поставить свободный велосипед в аренду без арендатора.')); return; }
        setSavingBike(true);
        try {
            await saveBike(bike.id, { model, type: String(form.get('type')), status: newStatus });
            toast.success(t('Велосипед обновлён'));
            setEditing(false);
            refresh();
        } catch (error) { toast.error(`${t('Ошибка сохранения')}: ${t(getErrorMessage(error))}`); }
        finally { setSavingBike(false); }
    };

    const handleDeleteBike = async () => {
        if (tenantName) { toast.error(t('Сначала отвяжите велосипед от арендатора {{name}}', { name: tenantName || '' })); return; }
        if (!bike.id) { toast.error(t('У велосипеда отсутствует идентификатор')); return; }
        setDeletingBike(true);
        try {
            await deleteBike(bike.id);
            toast.success(t('Велосипед удалён'));
            setDeleteBikeOpen(false);
            navigate('/bikes');
        } catch (error) { toast.error(`${t('Ошибка удаления')}: ${t(getErrorMessage(error))}`); }
        finally { setDeletingBike(false); }
    };

    const toggleTask = async (task: BikeTask) => {
        try {
            const result = await saveBikeTask(task.id, { bike_id: task.bike_id, title: task.title, description: task.description || '', status: task.status === 'done' ? 'open' : 'done', priority: task.priority, due_date: task.due_date || null });
            if (result.syncWarning) toast.error(t(result.syncWarning));
            refresh();
        } catch (error) { toast.error(`${t('Ошибка обновления задачи')}: ${t(getErrorMessage(error))}`); }
    };

    const removeTask = async (task: BikeTask) => {
        setDeletingTaskBusy(true);
        try {
            const result = await deleteBikeTask(task.id);
            if (result.syncWarning) toast.error(t(result.syncWarning));
            toast.success(t('Задача удалена'));
            refresh();
        } catch (error) { toast.error(`${t('Ошибка удаления')}: ${t(getErrorMessage(error))}`); }
        finally { setDeletingTaskBusy(false); }
    };

    return <div className="mx-auto max-w-5xl space-y-6 px-2 py-4 sm:px-6 sm:py-6">
        <Link to="/bikes" className="inline-flex items-center text-sm font-medium text-lime-800 hover:text-lime-700 dark:text-lime-400 dark:hover:text-lime-300"><ArrowLeft className="mr-1 h-4 w-4" /> {t('Вернуться к списку')}</Link>

        <section className="overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900">
            {!editing ? <div className="relative p-5 sm:p-6">
                <button type="button" onClick={() => setEditing(true)} aria-label={t('Редактировать велосипед')} title={t('Редактировать')} className="absolute right-5 top-5 rounded-md bg-slate-100 p-2 text-slate-500 hover:text-lime-800 dark:bg-slate-800 dark:text-slate-400 dark:hover:text-lime-400"><Edit2 className="h-4 w-4" /></button>
                <div className="flex flex-wrap items-center gap-3 pr-12">
                    <h1 className="text-2xl font-bold text-slate-900 dark:text-white">{bike.model}</h1>
                    <span className="rounded-md bg-lime-100 px-2.5 py-1 text-sm font-bold text-lime-950 dark:bg-lime-900/20 dark:text-lime-400">{bike.voice_code}</span>
                </div>
                <p className="mt-1 text-sm uppercase tracking-widest text-slate-500 dark:text-slate-400">{bike.type}</p>
                <div className="mt-6 grid grid-cols-1 gap-4 border-t border-slate-200 pt-5 sm:grid-cols-2 dark:border-slate-800">
                    <Info label={t('Статус')}><BikeStatusView status={bike.status} /></Info>
                    <Info label={t('Арендатор')}>{tenantName || t('Не назначен')}</Info>
                </div>
            </div> : <form onSubmit={handleSaveBike} className="space-y-5 p-5 sm:p-6">
                <h1 className="text-xl font-bold text-slate-900 dark:text-white">{t('Редактировать велосипед')}</h1>
                <label className="block text-sm font-medium text-slate-600 dark:text-slate-300">{t('Модель')}<input name="model" required defaultValue={bike.model || ''} className="mt-1 block w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-slate-900 dark:border-slate-700 dark:bg-slate-800 dark:text-white" /></label>
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2"><label className="text-sm font-medium text-slate-600 dark:text-slate-300">{t('Тип')}<select name="type" defaultValue={bike.type || 'mtb'} className="mt-1 block w-full rounded-md border border-slate-200 bg-white px-3 py-2 dark:border-slate-700 dark:bg-slate-800 dark:text-white"><option value="mtb">MTB</option><option value="fat">Fat</option></select></label><label className="text-sm font-medium text-slate-600 dark:text-slate-300">{t('Статус')}<select name="status" defaultValue={tenantName ? 'in_rent' : bike.status === 'in_rent' ? 'available' : bike.status || 'available'} disabled={Boolean(tenantName)} className="mt-1 block w-full rounded-md border border-slate-200 bg-white px-3 py-2 disabled:cursor-not-allowed disabled:opacity-60 dark:border-slate-700 dark:bg-slate-800 dark:text-white"><option value="available">{t(BIKE_STATUS_LABELS.available)}</option>{tenantName && <option value="in_rent">{t(BIKE_STATUS_LABELS.in_rent)}</option>}<option value="maintenance">{t(BIKE_STATUS_LABELS.maintenance)}</option></select>{tenantName && <span className="mt-1 block text-xs font-normal text-orange-700 dark:text-orange-300">{t('Сначала отвяжите велосипед от {{name}}.', { name: tenantName || '' })}</span>}</label></div>
                <div className="flex justify-between border-t border-slate-200 pt-4 dark:border-slate-800"><button type="button" onClick={() => tenantName ? toast.error(t('Сначала отвяжите велосипед от арендатора {{name}}', { name: tenantName || '' })) : setDeleteBikeOpen(true)} className="inline-flex items-center gap-2 rounded-md border border-red-700/50 px-3 py-2 text-sm text-red-600 hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-950/30"><Trash2 className="h-4 w-4" /> {t('Удалить')}</button><div className="flex gap-2"><button type="button" onClick={() => setEditing(false)} disabled={savingBike} className="rounded-md px-4 py-2 text-sm text-slate-600 hover:bg-slate-100 disabled:opacity-50 dark:text-slate-300 dark:hover:bg-slate-800">{t('Отмена')}</button><button type="submit" disabled={savingBike} className="rounded-md bg-lime-600 px-4 py-2 text-sm font-semibold text-slate-950 hover:bg-lime-700 disabled:opacity-50">{savingBike ? t('Сохранение…') : t('Сохранить')}</button></div></div>
            </form>}
        </section>

        <section className="overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900">
            <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4 dark:border-slate-800"><div><h2 className="text-lg font-bold text-slate-900 dark:text-white">{t('Задачи')}</h2><p className="text-sm text-slate-500 dark:text-slate-400">{t('Все задачи по этому велосипеду')}</p></div><button onClick={() => { setEditingTask(null); setTaskFormOpen(true); }} className="inline-flex items-center gap-1.5 rounded-md bg-lime-600 px-3 py-2 text-sm font-semibold text-slate-950 hover:bg-lime-700"><Plus className="h-4 w-4" /> {t('Добавить')}</button></div>
            {tasksError && <ErrorState message={t('Не удалось загрузить задачи.')} retry={() => { void queryClient.invalidateQueries({ queryKey: queryKeys.tasks.byBike(id!) }); }} />}
            {!tasksLoading && !tasksError && tasks.length === 0 && <EmptyState title={t('Для этого велосипеда задач пока нет')} action={<button type="button" onClick={() => { setEditingTask(null); setTaskFormOpen(true); }} className="rounded-md bg-lime-500 px-4 py-2 text-sm font-semibold text-slate-950 hover:bg-lime-400">{t('Добавить задачу')}</button>} />}
            <div className="divide-y divide-slate-100 dark:divide-slate-800">{tasks.map((task) => <div key={task.id} className="flex items-start justify-between gap-3 px-5 py-4"><div className="flex min-w-0 items-start gap-3"><input type="checkbox" checked={task.status === 'done'} onChange={() => toggleTask(task)} aria-label={`${t(task.status === 'done' ? 'Открыть' : 'Завершить')}: ${task.title}`} className="mt-1 h-4 w-4 shrink-0 cursor-pointer accent-lime-600" /><div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><h3 className="font-semibold text-slate-900 dark:text-white">{task.title}</h3><span className="text-xs text-slate-400">{t(taskStatuses[task.status])} · {t(priorities[task.priority])}</span></div>{task.description && <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">{task.description}</p>}{task.due_date && <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">{t('Срок:')} {formatDate(task.due_date)}</p>}</div></div><div className="flex shrink-0 gap-1"><button type="button" onClick={() => { setEditingTask(task); setTaskFormOpen(true); }} aria-label={`${t('Редактировать задачу')}: ${task.title}`} title={t('Редактировать')} className="rounded p-2 text-slate-400 hover:bg-slate-100 hover:text-lime-800 dark:hover:bg-slate-800"><Edit2 className="h-4 w-4" /></button><button type="button" onClick={() => setDeletingTask(task)} aria-label={`${t('Удалить задачу')}: ${task.title}`} title={t('Удалить')} className="rounded p-2 text-slate-400 hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-950/30"><Trash2 className="h-4 w-4" /></button></div></div>)}</div>
        </section>

        {taskFormOpen && <BikeTaskForm task={editingTask} bike={bike} onClose={() => setTaskFormOpen(false)} onSuccess={() => { setTaskFormOpen(false); refresh(); }} />}
        <ConfirmDialog open={deleteBikeOpen} title={t('Удалить велосипед?')} description={t('Велосипед «{{model}}» будет удалён без возможности восстановления.', { model: bike.model || '' })} busy={deletingBike} onCancel={() => setDeleteBikeOpen(false)} onConfirm={handleDeleteBike} />
        <ConfirmDialog open={Boolean(deletingTask)} title={t('Удалить задачу?')} description={deletingTask ? t('Задача «{{title}}» будет удалена.', { title: deletingTask.title }) : ''} busy={deletingTaskBusy} onCancel={() => setDeletingTask(null)} onConfirm={async () => { if (deletingTask) await removeTask(deletingTask); setDeletingTask(null); }} />
    </div>;
}

function Info({ label, children }: { label: string; children: ReactNode }) { return <div className="rounded-lg bg-slate-100 p-3 dark:bg-slate-800/60"><span className="mb-1 block text-xs text-slate-400">{label}</span><span className="font-semibold text-slate-900 dark:text-white">{children}</span></div>; }
function BikeStatusView({ status }: { status: Bike['status'] }) {
    const { t } = useI18n();
    const tone = status === 'available' ? 'lime' : status === 'maintenance' ? 'amber' : 'slate';
    return <StatusBadge tone={tone}>{t(getBikeStatusLabel(status))}</StatusBadge>;
}

function BikeTaskForm({ task, bike, onClose, onSuccess }: { task: BikeTask | null; bike: Bike; onClose: () => void; onSuccess: () => void }) {
    const { t } = useI18n();
    const [saving, setSaving] = useState(false);
    const [form, setForm] = useState({ title: task?.title || '', description: task?.description || '', status: task?.status || 'open' as BikeTaskStatus, priority: task?.priority || 'normal' as BikeTaskPriority, due_date: task?.due_date || '' });
    const submit = async (event: FormEvent<HTMLFormElement>) => {
        event.preventDefault();
        if (!form.title.trim()) { toast.error(t('Укажите название задачи')); return; }
        if (!bike.id) { toast.error(t('У велосипеда отсутствует идентификатор')); return; }
        setSaving(true);
        try {
            const result = await saveBikeTask(task?.id, { bike_id: bike.id, ...form, title: form.title.trim(), due_date: form.due_date || null });
            if (result.syncWarning) toast.error(t(result.syncWarning));
            toast.success(t(task ? 'Задача обновлена' : 'Задача создана'));
            onSuccess();
        } catch (error) { toast.error(`${t('Ошибка сохранения')}: ${t(getErrorMessage(error))}`); }
        finally { setSaving(false); }
    };
    return <div className="border-t border-slate-200 p-5 dark:border-slate-800"><form onSubmit={submit} className="space-y-4"><div className="flex items-center justify-between"><h3 className="font-semibold text-slate-900 dark:text-white">{t(task ? 'Редактировать задачу' : 'Новая задача')}</h3><button type="button" onClick={onClose} aria-label={t('Закрыть форму задачи')} className="text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-white"><X className="h-5 w-5" /></button></div><input required value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder={t('Название задачи')} className="w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-800 dark:text-white" /><textarea rows={3} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} placeholder={t('Описание')} className="w-full resize-none rounded-md border border-slate-200 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-800 dark:text-white" /><div className="grid grid-cols-1 gap-3 sm:grid-cols-3"><select value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value as BikeTaskStatus })} className="rounded-md border border-slate-200 bg-white px-2 py-2 text-sm dark:border-slate-700 dark:bg-slate-800 dark:text-white">{Object.entries(taskStatuses).map(([value, label]) => <option key={value} value={value}>{t(label)}</option>)}</select><select value={form.priority} onChange={(e) => setForm({ ...form, priority: e.target.value as BikeTaskPriority })} className="rounded-md border border-slate-200 bg-white px-2 py-2 text-sm dark:border-slate-700 dark:bg-slate-800 dark:text-white">{Object.entries(priorities).map(([value, label]) => <option key={value} value={value}>{t(label)}</option>)}</select><DateInput value={form.due_date} aria-label={t('Срок задачи')} onChange={(value) => setForm({ ...form, due_date: value })} className="rounded-md border border-slate-200 bg-white px-2 py-2 text-sm dark:border-slate-700 dark:bg-slate-800 dark:text-white" /></div><div className="flex justify-end gap-2"><button type="button" onClick={onClose} disabled={saving} className="rounded-md px-3 py-2 text-sm text-slate-600 hover:bg-slate-100 disabled:opacity-50 dark:text-slate-300 dark:hover:bg-slate-800">{t('Отмена')}</button><button type="submit" disabled={saving} className="rounded-md bg-lime-600 px-3 py-2 text-sm font-semibold text-slate-950 hover:bg-lime-700 disabled:opacity-50">{saving ? t('Сохранение…') : t('Сохранить')}</button></div></form></div>;
}
