import { useEffect, useState, type FormEvent } from 'react';
import { addDays, format } from 'date-fns';
import { Trash2, X } from 'lucide-react';
import { normalizePaymentAdjustmentDirection, type PaymentAdjustment, type PaymentAdjustmentDirection, type PaymentCharge, type PaymentEditorValue, type TenantDetail } from '../../types';
import { deleteTenantRecord, saveAdjustment, saveCharge, savePayment } from '../../features/tenants/api';
import type { DeletableRecord } from '../../types';
import { getTenantWeeklyPayment } from '../../utils/calculateDebt';
import { getErrorMessage } from '../../shared/lib/errors';
import toast from 'react-hot-toast';
import { DateInput } from '../../shared/ui/DateInput';
import { ConfirmDialog } from '../../shared/ui';
import { useI18n } from '../../i18n';

export type LedgerModalEntry =
    | { type: 'payment'; value: PaymentEditorValue | null }
    | { type: 'charge'; value: PaymentCharge | null }
    | { type: 'adjustment'; value: PaymentAdjustment | null }
    | null;

type LedgerRecordType = 'payment' | 'charge' | 'adjustment';
type AdjustmentMode = 'delta' | 'set_balance';

interface TenantLedgerModalFormProps {
    tenant: TenantDetail;
    entry: LedgerModalEntry;
    onClose: () => void;
    onSuccess: () => void;
}

export function TenantLedgerModalForm({ tenant, entry, onClose, onSuccess }: TenantLedgerModalFormProps) {
    const { t } = useI18n();
    const isEdit = Boolean(entry?.value);
    const today = format(new Date(), 'yyyy-MM-dd');
    const defaultPeriodStart = today;
    const defaultPeriodEnd = format(addDays(new Date(), 6), 'yyyy-MM-dd');
    const [recordType, setRecordType] = useState<LedgerRecordType>(entry?.type || 'payment');
    const [adjustmentMode, setAdjustmentMode] = useState<AdjustmentMode>(entry?.type === 'adjustment' && entry.value?.balance_override != null ? 'set_balance' : 'delta');
    const [direction, setDirection] = useState<PaymentAdjustmentDirection>(entry?.type === 'adjustment' ? entry.value?.direction || 'credit' : 'credit');
    const [amount, setAmount] = useState<number | string>(entry?.value?.amount || getTenantWeeklyPayment(tenant) || '');
    const [balanceTarget, setBalanceTarget] = useState<number | string>(entry?.type === 'adjustment' && entry.value?.balance_override != null ? entry.value.balance_override : '');
    const [date, setDate] = useState(entry?.type === 'adjustment' ? entry.value?.adjustment_date || today : entry?.type === 'charge' ? entry.value?.due_date || today : entry?.value?.payment_date || today);
    const [periodStart, setPeriodStart] = useState(entry?.type === 'charge' ? entry.value?.period_start || entry.value?.due_date || defaultPeriodStart : defaultPeriodStart);
    const [periodEnd, setPeriodEnd] = useState(entry?.type === 'charge' ? entry.value?.period_end || entry.value?.due_date || defaultPeriodEnd : today);
    const [chargeStatus, setChargeStatus] = useState<'open' | 'waived'>(entry?.type === 'charge' && entry.value?.status === 'waived' ? 'waived' : 'open');
    const [comment, setComment] = useState(entry?.value?.comment || '');
    const [loading, setLoading] = useState(false);
    const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
    const fieldClass = 'mt-1 block min-h-11 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 outline-none transition-colors focus:border-lime-500 focus:ring-2 focus:ring-lime-500/20 dark:border-slate-700 dark:bg-slate-950 dark:text-white';

    const handleDelete = async () => {
        if (!entry?.value || !('id' in entry.value) || !entry.value.id) return;
        setLoading(true);
        try {
            const type = entry.type === 'charge' ? 'charge' : entry.type === 'adjustment' ? 'adjustment' : 'payment';
            await deleteTenantRecord({ type, id: entry.value.id } as DeletableRecord, tenant.id);
            toast.success(t('Запись удалена'));
            setDeleteConfirmOpen(false);
            onSuccess();
        } catch (error) {
            toast.error(t(getErrorMessage(error)));
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        setRecordType(entry?.type || 'payment');
        setAdjustmentMode(entry?.type === 'adjustment' && entry.value?.balance_override != null ? 'set_balance' : 'delta');
        setDirection(entry?.type === 'adjustment' ? entry.value?.direction || 'credit' : 'credit');
        setAmount(entry?.value?.amount || getTenantWeeklyPayment(tenant) || '');
        setBalanceTarget(entry?.type === 'adjustment' && entry.value?.balance_override != null ? entry.value.balance_override : '');
        setDate(entry?.type === 'adjustment' ? entry.value?.adjustment_date || today : entry?.type === 'charge' ? entry.value?.due_date || today : entry?.value?.payment_date || today);
        setPeriodStart(entry?.type === 'charge' ? entry.value?.period_start || entry.value?.due_date || defaultPeriodStart : defaultPeriodStart);
        setPeriodEnd(entry?.type === 'charge' ? entry.value?.period_end || entry.value?.due_date || defaultPeriodEnd : today);
        setChargeStatus(entry?.type === 'charge' && entry.value?.status === 'waived' ? 'waived' : 'open');
        setComment(entry?.value?.comment || '');
    }, [entry, tenant, today, defaultPeriodStart, defaultPeriodEnd]);

    const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
        event.preventDefault();
        setLoading(true);
        try {
            if (recordType === 'adjustment') {
                if (!comment.trim()) throw new Error(t('Укажите причину корректировки'));
                if (adjustmentMode === 'set_balance' && balanceTarget === '') throw new Error(t('Укажите баланс на выбранную дату'));
                await saveAdjustment(tenant.id, entry?.type === 'adjustment' ? entry.value : null, {
                    direction: adjustmentMode === 'set_balance' ? (Number(balanceTarget) >= 0 ? 'charge' : 'credit') : direction,
                    amount: adjustmentMode === 'set_balance' ? 0 : Number(amount),
                    balance_override: adjustmentMode === 'set_balance' ? Number(balanceTarget) : null,
                    adjustment_date: date,
                    comment: comment.trim()
                });
            } else if (recordType === 'charge') {
                if (periodEnd < periodStart) throw new Error(t('Конец периода не может быть раньше начала'));
                await saveCharge(tenant.id, entry?.type === 'charge' ? entry.value : null, {
                    amount: Number(amount),
                    due_date: date,
                    period_start: periodStart,
                    period_end: periodEnd,
                    comment: comment.trim(),
                    status: chargeStatus
                });
            } else {
                await savePayment(tenant.id, entry?.type === 'payment' ? entry.value : null, Number(amount), date, comment.trim());
            }
            onSuccess();
        } catch (error) {
            toast.error(t(getErrorMessage(error)));
        } finally {
            setLoading(false);
        }
    };

    return (
        <div>
            <div className="mb-5 flex items-center justify-between">
                <h3 className="text-lg font-medium text-slate-900 dark:text-white">{isEdit ? t(recordType === 'adjustment' ? 'Редактировать корректировку' : recordType === 'charge' ? 'Редактировать начисление' : 'Редактировать платеж') : t('Новая запись')}</h3>
                <button type="button" onClick={onClose} aria-label={t('Закрыть')} className="rounded-md p-1 text-slate-500 hover:bg-slate-100 hover:text-slate-900 dark:hover:bg-slate-800 dark:hover:text-white"><X className="h-5 w-5" /></button>
            </div>
            <form onSubmit={handleSubmit} className="space-y-4">
                {!isEdit && <div><label className="block text-sm font-medium text-slate-600 dark:text-slate-300">{t('Тип записи')}</label><select aria-label={t('Тип записи')} value={recordType} onChange={event => setRecordType(event.target.value as LedgerRecordType)} className={fieldClass}><option value="payment">{t('Оплата')}</option><option value="charge">{t('Начисление')}</option><option value="adjustment">{t('Корректировка баланса')}</option></select></div>}
                {recordType === 'adjustment' && <div><label className="block text-sm font-medium text-slate-600 dark:text-slate-300">{t('Способ корректировки')}</label><select aria-label={t('Способ корректировки')} value={adjustmentMode} onChange={event => setAdjustmentMode(event.target.value as AdjustmentMode)} className={fieldClass}><option value="set_balance">{t('Установить баланс на дату')}</option><option value="delta">{t('Изменить баланс на сумму')}</option></select></div>}
                {recordType === 'adjustment' && adjustmentMode === 'delta' && <div><label className="block text-sm font-medium text-slate-600 dark:text-slate-300">{t('Тип корректировки')}</label><select aria-label={t('Тип корректировки')} value={direction} onChange={event => setDirection(normalizePaymentAdjustmentDirection(event.target.value))} className={fieldClass}><option value="credit">{t('Списать долг')}</option><option value="charge">{t('Увеличить долг')}</option></select></div>}
                {recordType === 'adjustment' && adjustmentMode === 'set_balance'
                    ? <div><label className="block text-sm font-medium text-slate-600 dark:text-slate-300">{t('Баланс на эту дату (zł)')}</label><input aria-label={t('Баланс на эту дату (zł)')} type="number" step="0.01" required value={balanceTarget} onChange={event => setBalanceTarget(event.target.value)} placeholder="0" className={fieldClass} /><p className="mt-1.5 text-xs text-slate-500 dark:text-slate-400">{t('Положительное число — долг, отрицательное — аванс. Все следующие операции считаются от этой суммы.')}</p></div>
                    : <div><label className="block text-sm font-medium text-slate-600 dark:text-slate-300">{t('Сумма (zł)')}</label><input aria-label={t('Сумма (zł)')} type="number" min="0.01" step="0.01" required value={amount} onChange={event => setAmount(event.target.value)} className={fieldClass} /></div>}
                <div><label className="block text-sm font-medium text-slate-600 dark:text-slate-300">{t(recordType === 'charge' ? 'Дата начисления' : 'Дата')}</label><DateInput aria-label={t('Дата')} required value={date} onChange={setDate} className={fieldClass} /></div>
                {recordType === 'charge' && <div className="grid grid-cols-1 gap-3 sm:grid-cols-2"><div><label className="block text-sm font-medium text-slate-600 dark:text-slate-300">{t('Период с')}</label><DateInput aria-label={t('Период с')} required value={periodStart} onChange={setPeriodStart} className={fieldClass} /></div><div><label className="block text-sm font-medium text-slate-600 dark:text-slate-300">{t('Период по')}</label><DateInput aria-label={t('Период по')} required value={periodEnd} onChange={setPeriodEnd} className={fieldClass} /></div></div>}
                {recordType === 'charge' && <div><label className="block text-sm font-medium text-slate-600 dark:text-slate-300">{t('Статус')}</label><select aria-label={t('Статус начисления')} value={chargeStatus} onChange={event => setChargeStatus(event.target.value === 'waived' ? 'waived' : 'open')} className={fieldClass}><option value="open">{t('Активно')}</option><option value="waived">{t('Отменено — не учитывать в долге')}</option></select></div>}
                <div><label className="block text-sm font-medium text-slate-600 dark:text-slate-300">{t(recordType === 'adjustment' ? 'Причина корректировки' : 'Комментарий')}</label><textarea aria-label={t(recordType === 'adjustment' ? 'Причина корректировки' : 'Комментарий')} required={recordType === 'adjustment'} value={comment} onChange={event => setComment(event.target.value)} rows={3} placeholder={t(recordType === 'adjustment' ? 'Почему меняем баланс?' : recordType === 'charge' ? 'Например: аренда завершена раньше' : 'Например: частичная оплата')} className={`${fieldClass} resize-y`} /></div>
                <div className="flex flex-col-reverse gap-2 pt-2 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between sm:gap-3"><div>{isEdit && <button type="button" onClick={() => setDeleteConfirmOpen(true)} disabled={loading} className="inline-flex w-full items-center justify-center gap-2 rounded-md px-2 py-2 text-sm font-semibold text-red-500 hover:bg-red-50 disabled:opacity-50 dark:hover:bg-red-950/30 sm:w-auto"><Trash2 className="h-4 w-4" /> {t('Удалить запись')}</button>}</div><div className="flex flex-col-reverse gap-2 sm:flex-row sm:gap-3"><button type="button" onClick={onClose} className="rounded-md px-4 py-2 text-sm text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800">{t('Отмена')}</button><button type="submit" disabled={loading} className="rounded-md bg-lime-500 px-4 py-2 text-sm font-semibold text-slate-950 hover:bg-lime-400 disabled:opacity-50">{loading ? t('Сохранение…') : t('Сохранить')}</button></div></div>
            </form>
            <ConfirmDialog open={deleteConfirmOpen} title={t('Удалить запись?')} description={t('Удалить эту запись из журнала? Баланс будет пересчитан.')} busy={loading} onCancel={() => setDeleteConfirmOpen(false)} onConfirm={handleDelete} />
        </div>
    );
}
