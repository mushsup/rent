import { useState, type FormEvent } from 'react';
import { Trash2, X } from 'lucide-react';
import toast from 'react-hot-toast';
import type { Bike, BikeStatus, Tenant } from '../../types';
import { deleteBike, saveBike } from '../../features/bikes/api';
import { ConfirmDialog } from '../../shared/ui';
import { getErrorMessage } from '../../shared/lib/errors';
import { BIKE_STATUS_LABELS } from '../../features/bikes/status';
import { useI18n } from '../../i18n';

interface BikeModalProps {
    bike: Bike | null;
    assignedTenant: Tenant | null;
    onClose: () => void;
    onSuccess: () => void;
}

export function BikeModal({ bike, assignedTenant, onClose, onSuccess }: BikeModalProps) {
    const { t } = useI18n();
    const [formData, setFormData] = useState<{ model: string; type: string; status: BikeStatus }>({ model: bike?.model || '', type: bike?.type || 'mtb', status: bike?.status || 'available' });
    const [loading, setLoading] = useState(false);
    const [confirmDeleteOpen, setConfirmDeleteOpen] = useState(false);
    const isEdit = !!bike;

    const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
        event.preventDefault();
        const model = formData.model.trim();
        if (!model) { toast.error(t('Укажите модель велосипеда')); return; }
        setLoading(true);
        try {
            const statusToSave = assignedTenant ? 'in_rent' : formData.status;
            if (!assignedTenant && statusToSave === 'in_rent') { toast.error(t('Нельзя поставить свободный велосипед в аренду без арендатора.')); return; }
            await saveBike(bike?.id, { model, type: formData.type.trim(), status: statusToSave });
            toast.success(t(isEdit ? 'Обновлено успешно' : 'Создан новый велосипед'));
            onSuccess();
        } catch (error) {
            toast.error(t(getErrorMessage(error)));
        } finally {
            setLoading(false);
        }
    };

    const handleDelete = async () => {
        if (!bike) return;
        if (assignedTenant) { toast.error(t('Сначала отвяжите велосипед от арендатора {{name}}', { name: assignedTenant.name || '' })); return; }
        if (!bike.id) { toast.error(t('У велосипеда отсутствует идентификатор')); return; }
        setLoading(true);
        try {
            await deleteBike(bike.id);
            toast.success(t('Велосипед удалён'));
            setConfirmDeleteOpen(false);
            onSuccess();
        } catch (error) {
            toast.error(t(getErrorMessage(error)));
        } finally {
            setLoading(false);
        }
    };

    const setField = (field: 'model' | 'type', value: string) => setFormData(current => ({ ...current, [field]: value }));
    const setStatus = (status: BikeStatus) => setFormData(current => ({ ...current, status }));
    const statusOptions: Array<{ id: BikeStatus; label: string }> = assignedTenant
        ? [{ id: 'in_rent', label: BIKE_STATUS_LABELS.in_rent }]
        : [{ id: 'available', label: BIKE_STATUS_LABELS.available }, { id: 'maintenance', label: BIKE_STATUS_LABELS.maintenance }];

    return <div>
        <div className="mb-4 flex items-center justify-between border-b border-slate-200 pb-3 dark:border-slate-800"><h3 className="text-lg font-semibold text-slate-900 dark:text-white">{t(isEdit ? 'Редактировать велосипед' : 'Новый велосипед')}</h3><button type="button" onClick={onClose} aria-label={t('Закрыть')} className="rounded-md bg-slate-200/50 p-1 text-slate-500 hover:bg-slate-200 hover:text-slate-900 dark:bg-slate-700/50 dark:text-slate-400 dark:hover:bg-slate-700 dark:hover:text-white"><X className="h-5 w-5" /></button></div>
        <form onSubmit={handleSubmit} className="mt-4 space-y-6">
            <div><label htmlFor="bike-model" className="mb-2 block text-sm font-medium text-slate-600 dark:text-slate-300">{t('Модель')}</label><input id="bike-model" type="text" required value={formData.model} onChange={event => setField('model', event.target.value)} className="block w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-slate-900 dark:border-slate-600 dark:bg-slate-700 dark:text-white" placeholder={t('Например: Engwe EP-2 Pro')} /></div>
            <div><span id="bike-type-label" className="mb-2 block text-sm font-medium text-slate-600 dark:text-slate-300">{t('Тип')}</span><div role="group" aria-labelledby="bike-type-label" className="flex rounded-lg border border-slate-200 bg-slate-100 p-1 dark:border-slate-800 dark:bg-slate-700">{['mtb', 'fat'].map(type => <button key={type} type="button" aria-pressed={formData.type === type} onClick={() => setField('type', type)} className={`flex-1 rounded-md py-1.5 text-xs font-bold uppercase tracking-widest ${formData.type === type ? 'bg-lime-600 text-slate-950 shadow-sm' : 'text-slate-500 dark:text-slate-400'}`}>{type}</button>)}</div></div>
            <div><span id="bike-status-label" className="mb-2 block text-sm font-medium text-slate-600 dark:text-slate-300">{t('Статус')}</span><div role="group" aria-labelledby="bike-status-label" className="flex rounded-lg border border-slate-200 bg-slate-100 p-1 dark:border-slate-800 dark:bg-slate-700">{statusOptions.map(status => <button key={status.id} type="button" aria-pressed={formData.status === status.id} onClick={() => setStatus(status.id)} className={`flex-1 rounded-md py-2 text-xs font-medium ${formData.status === status.id ? 'bg-lime-600 text-slate-950 shadow-sm' : 'text-slate-500 dark:text-slate-400'}`}>{t(status.label)}</button>)}</div>{assignedTenant && <p className="mt-2 text-xs text-orange-700 dark:text-orange-300">{t('Сначала отвяжите велосипед от арендатора, чтобы изменить его статус.')}</p>}</div>
            <div className={`${isEdit ? 'sm:grid-cols-3' : 'sm:grid-cols-2'} mt-6 sm:grid sm:grid-flow-row-dense sm:gap-3`}>{isEdit && <button type="button" onClick={() => assignedTenant ? toast.error(t('Сначала отвяжите велосипед от арендатора {{name}}', { name: assignedTenant.name || '' })) : setConfirmDeleteOpen(true)} disabled={loading} className="inline-flex w-full items-center justify-center rounded-md border border-red-700/50 bg-red-900/20 px-4 py-2 text-base font-medium text-red-400 hover:bg-red-900/40 disabled:opacity-50 sm:col-start-3 sm:text-sm"><Trash2 className="mr-2 h-4 w-4" />{t('Удалить')}</button>}<button type="submit" disabled={loading} className="inline-flex w-full justify-center rounded-md bg-lime-600 px-4 py-2 text-base font-semibold text-slate-950 hover:bg-lime-500 disabled:opacity-50 sm:col-start-2 sm:text-sm">{loading ? t('Сохранение…') : t(isEdit ? 'Сохранить' : 'Создать')}</button><button type="button" onClick={onClose} className="mt-0 inline-flex w-full justify-center rounded-md bg-slate-200 px-4 py-2 text-base font-medium text-slate-800 hover:bg-slate-300 dark:bg-slate-700 dark:text-slate-200 dark:hover:bg-slate-600 sm:col-start-1 sm:text-sm">{t('Отмена')}</button></div>
        </form>
        <ConfirmDialog open={confirmDeleteOpen} title={t('Удалить велосипед?')} description={t('Велосипед «{{model}}» будет удалён без возможности восстановления.', { model: bike?.model || '' })} busy={loading} onCancel={() => setConfirmDeleteOpen(false)} onConfirm={handleDelete} />
    </div>;
}
