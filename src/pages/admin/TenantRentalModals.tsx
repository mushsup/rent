import { useState, type FormEvent, type ReactNode } from 'react';
import { format } from 'date-fns';
import { X } from 'lucide-react';
import type { RentalEvent, TenantDetail } from '../../types';
import { finishTenantRental, updateFinishedTenantRental } from '../../features/tenants/api';
import { getRentalEndPreview } from '../../utils/rentalEnd';
import { getErrorMessage } from '../../shared/lib/errors';
import { Dialog } from '../../shared/ui';
import { DateInput } from '../../shared/ui/DateInput';
import toast from 'react-hot-toast';
import { useI18n } from '../../i18n';

interface TenantRentalModalProps {
    tenant: TenantDetail;
    onClose: () => void;
    onSuccess: () => void;
}

interface RentalEndModalProps extends TenantRentalModalProps {
    event?: RentalEvent | null;
}

/** Creates an end-of-rental settlement for an active rental or corrects the existing one. */
export function RentalEndModal({ tenant, event, onClose, onSuccess }: RentalEndModalProps) {
    const { t } = useI18n();
    const isEditing = Boolean(event?.id);
    const today = format(new Date(), 'yyyy-MM-dd');
    const [endDate, setEndDate] = useState(event?.effective_date || today);
    const currentCharge = tenant.payment_charges?.find(charge => (charge.period_start || charge.due_date) <= today && (charge.period_end || charge.due_date) >= today);
    const [finalAmount, setFinalAmount] = useState(String(event?.amount ?? currentCharge?.amount ?? tenant.weekly_payment ?? ''));
    const [reason, setReason] = useState(event?.reason || t('Аренда завершена'));
    const [loading, setLoading] = useState(false);
    const preview = getRentalEndPreview(tenant, endDate || today);

    const submit = async (formEvent: FormEvent<HTMLFormElement>) => {
        formEvent.preventDefault();
        if (!reason.trim()) {
            toast.error(t('Укажите причину завершения'));
            return;
        }
        setLoading(true);
        try {
            const input = { end_date: endDate, final_amount: Number(finalAmount) || 0, reason };
            if (event?.id) await updateFinishedTenantRental(event.id, input);
            else await finishTenantRental(tenant.id, input);
            toast.success(t(isEditing ? 'Завершение аренды обновлено' : 'Аренда завершена'));
            onSuccess();
        } catch (error) {
            toast.error(t(getErrorMessage(error)));
        } finally {
            setLoading(false);
        }
    };

    return <ModalShell onClose={onClose} ariaLabel={t(isEditing ? 'Редактирование завершения аренды' : 'Завершение аренды')}>
        <div className="flex items-start justify-between gap-4"><div><p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500 dark:text-slate-400">{t('Аренда')}</p><h2 className="mt-1 text-xl font-bold text-slate-950 dark:text-white">{t(isEditing ? 'Редактировать завершение' : 'Завершить аренду')}</h2><p className="mt-2 text-sm text-slate-600 dark:text-slate-400">{t(isEditing ? 'Исправьте дату, итоговое начисление или причину. Велосипед и статус аренды не изменятся.' : 'Велосипед станет доступен. Сумма ниже заменит начисление за незакрытый период — проверьте её перед сохранением.')}</p></div><CloseButton onClose={onClose} /></div>
        <form onSubmit={submit} className="mt-6 space-y-4">
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">{t('Дата завершения')}<DateInput required value={endDate} max={today} onChange={setEndDate} className={inputClass} /></label>
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">{t('Итоговое начисление (zł)')}<input required min="0" step="0.01" type="number" value={finalAmount} onChange={formEvent => setFinalAmount(formEvent.target.value)} className={inputClass} /></label>
            <p className="rounded-lg border border-slate-200 bg-slate-100 px-3 py-2 text-xs leading-relaxed text-slate-600 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-400">{t('Пропорция по дням:')} {preview.usedDays} {t('из')} {preview.totalDays} ({preview.periodStart} — {preview.periodEnd}) ≈ <span className="font-bold text-slate-950 dark:text-slate-200">{preview.suggestedAmount} zł</span>. <button type="button" onClick={() => setFinalAmount(String(preview.suggestedAmount))} className="font-medium text-lime-800 underline-offset-2 hover:underline dark:text-lime-300">{t('Подставить')}</button></p>
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">{t('Причина')}<textarea required value={reason} onChange={formEvent => setReason(formEvent.target.value)} className={`${inputClass} min-h-20 resize-y`} /></label>
            <ModalActions onClose={onClose} loading={loading} submitLabel={t(isEditing ? 'Сохранить изменения' : 'Завершить аренду')} />
        </form>
    </ModalShell>;
}

const inputClass = 'mt-1.5 block w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-slate-900 dark:border-slate-700 dark:bg-slate-900 dark:text-white';

function ModalShell({ children, onClose, ariaLabel }: { children: ReactNode; onClose: () => void; ariaLabel: string }) {
    return <Dialog open ariaLabel={ariaLabel} onClose={onClose} className="border-slate-200 bg-white p-5 text-slate-950 dark:border-slate-700 dark:bg-slate-950 dark:text-white sm:p-6">{children}</Dialog>;
}

function CloseButton({ onClose }: { onClose: () => void }) {
    const { t } = useI18n();
    return <button type="button" onClick={onClose} aria-label={t('Закрыть')} className="absolute right-4 top-4 rounded-lg p-1.5 text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-900 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-white"><X className="h-5 w-5" /></button>;
}

function ModalActions({ onClose, loading, submitLabel, loadingLabel }: { onClose: () => void; loading: boolean; submitLabel: string; loadingLabel?: string }) {
    const { t } = useI18n();
    return <div className="flex flex-col-reverse gap-2 pt-1 sm:flex-row sm:justify-end sm:gap-3"><button type="button" onClick={onClose} className="rounded-lg px-4 py-2.5 text-sm font-medium text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800">{t('Отмена')}</button><button type="submit" disabled={loading} className="rounded-lg bg-lime-500 px-4 py-2.5 text-sm font-bold text-slate-950 hover:bg-lime-400 disabled:opacity-50">{loading ? (loadingLabel || t('Сохраняем…')) : submitLabel}</button></div>;
}
