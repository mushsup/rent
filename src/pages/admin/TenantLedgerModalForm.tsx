import { useEffect, useState, type FormEvent } from 'react';
import { addDays, format } from 'date-fns';
import { X } from 'lucide-react';
import { normalizePaymentAdjustmentDirection, type PaymentAdjustment, type PaymentAdjustmentDirection, type PaymentCharge, type PaymentEditorValue, type TenantDetail } from '../../types';
import { saveAdjustment, saveCharge, savePayment } from '../../features/tenants/api';
import { getTenantWeeklyPayment } from '../../utils/calculateDebt';
import { getErrorMessage } from '../../shared/lib/errors';
import toast from 'react-hot-toast';

export type LedgerModalEntry =
    | { type: 'payment'; value: PaymentEditorValue | null }
    | { type: 'charge'; value: PaymentCharge | null }
    | { type: 'adjustment'; value: PaymentAdjustment | null }
    | null;

type LedgerRecordType = 'payment' | 'charge' | 'adjustment';

interface TenantLedgerModalFormProps {
    tenant: TenantDetail;
    entry: LedgerModalEntry;
    onClose: () => void;
    onSuccess: () => void;
}

export function TenantLedgerModalForm({ tenant, entry, onClose, onSuccess }: TenantLedgerModalFormProps) {
    const isEdit = Boolean(entry?.value);
    const today = format(new Date(), 'yyyy-MM-dd');
    const defaultPeriodStart = today;
    const defaultPeriodEnd = format(addDays(new Date(), 6), 'yyyy-MM-dd');
    const [recordType, setRecordType] = useState<LedgerRecordType>(entry?.type || 'payment');
    const [direction, setDirection] = useState<PaymentAdjustmentDirection>(entry?.type === 'adjustment' ? entry.value?.direction || 'credit' : 'credit');
    const [amount, setAmount] = useState<number | string>(entry?.value?.amount || getTenantWeeklyPayment(tenant) || '');
    const [date, setDate] = useState(entry?.type === 'adjustment' ? entry.value?.adjustment_date || today : entry?.type === 'charge' ? entry.value?.due_date || today : entry?.value?.payment_date || today);
    const [periodStart, setPeriodStart] = useState(entry?.type === 'charge' ? entry.value?.period_start || entry.value?.due_date || defaultPeriodStart : defaultPeriodStart);
    const [periodEnd, setPeriodEnd] = useState(entry?.type === 'charge' ? entry.value?.period_end || entry.value?.due_date || defaultPeriodEnd : today);
    const [comment, setComment] = useState(entry?.value?.comment || '');
    const [loading, setLoading] = useState(false);

    useEffect(() => {
        setRecordType(entry?.type || 'payment');
        setDirection(entry?.type === 'adjustment' ? entry.value?.direction || 'credit' : 'credit');
        setAmount(entry?.value?.amount || getTenantWeeklyPayment(tenant) || '');
        setDate(entry?.type === 'adjustment' ? entry.value?.adjustment_date || today : entry?.type === 'charge' ? entry.value?.due_date || today : entry?.value?.payment_date || today);
        setPeriodStart(entry?.type === 'charge' ? entry.value?.period_start || entry.value?.due_date || defaultPeriodStart : defaultPeriodStart);
        setPeriodEnd(entry?.type === 'charge' ? entry.value?.period_end || entry.value?.due_date || defaultPeriodEnd : today);
        setComment(entry?.value?.comment || '');
    }, [entry, tenant, today, defaultPeriodStart, defaultPeriodEnd]);

    const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
        event.preventDefault();
        setLoading(true);
        try {
            if (recordType === 'adjustment') {
                if (!comment.trim()) throw new Error('Укажите причину корректировки');
                await saveAdjustment(tenant.id, entry?.type === 'adjustment' ? entry.value : null, {
                    direction,
                    amount: Number(amount),
                    adjustment_date: date,
                    comment: comment.trim()
                });
            } else if (recordType === 'charge') {
                if (periodEnd < periodStart) throw new Error('Конец периода не может быть раньше начала');
                await saveCharge(tenant.id, entry?.type === 'charge' ? entry.value : null, {
                    amount: Number(amount),
                    due_date: date,
                    period_start: periodStart,
                    period_end: periodEnd,
                    comment: comment.trim(),
                    status: entry?.type === 'charge' ? entry.value?.status || 'open' : 'open'
                });
            } else {
                await savePayment(tenant.id, entry?.type === 'payment' ? entry.value : null, Number(amount), date, comment.trim());
            }
            onSuccess();
        } catch (error) {
            toast.error(getErrorMessage(error));
        } finally {
            setLoading(false);
        }
    };

    return (
        <div>
            <div className="mb-5 flex items-center justify-between">
                <h3 className="text-lg font-medium text-slate-900 dark:text-white">{isEdit ? (recordType === 'adjustment' ? 'Редактировать корректировку' : recordType === 'charge' ? 'Редактировать начисление' : 'Редактировать платеж') : 'Новая запись'}</h3>
                <button type="button" onClick={onClose} className="rounded-md p-1 text-slate-500 hover:bg-slate-100 hover:text-slate-900 dark:hover:bg-slate-800 dark:hover:text-white"><X className="h-5 w-5" /></button>
            </div>
            <form onSubmit={handleSubmit} className="space-y-4">
                {!isEdit && <div><label className="block text-sm font-medium text-slate-600 dark:text-slate-300">Тип записи</label><select aria-label="Тип записи" value={recordType} onChange={event => setRecordType(event.target.value as LedgerRecordType)} className="mt-1 block w-full rounded-md bg-slate-100 px-3 py-2 text-slate-900 dark:bg-slate-800 dark:text-white"><option value="payment">Оплата</option><option value="charge">Начисление</option><option value="adjustment">Корректировка баланса</option></select></div>}
                {recordType === 'adjustment' && <div><label className="block text-sm font-medium text-slate-600 dark:text-slate-300">Тип корректировки</label><select aria-label="Тип корректировки" value={direction} onChange={event => setDirection(normalizePaymentAdjustmentDirection(event.target.value))} className="mt-1 block w-full rounded-md bg-slate-100 px-3 py-2 text-slate-900 dark:bg-slate-800 dark:text-white"><option value="credit">Списать долг</option><option value="charge">Увеличить долг</option></select></div>}
                <div><label className="block text-sm font-medium text-slate-600 dark:text-slate-300">Сумма (zł)</label><input aria-label="Сумма (zł)" type="number" min="0.01" step="0.01" required value={amount} onChange={event => setAmount(event.target.value)} className="mt-1 block w-full rounded-md bg-slate-100 px-3 py-2 text-slate-900 dark:bg-slate-800 dark:text-white" /></div>
                <div><label className="block text-sm font-medium text-slate-600 dark:text-slate-300">{recordType === 'charge' ? 'Дата начисления' : 'Дата'}</label><input aria-label="Дата" type="date" required value={date} onChange={event => setDate(event.target.value)} className="mt-1 block w-full rounded-md bg-slate-100 px-3 py-2 text-slate-900 dark:bg-slate-800 dark:text-white" /></div>
                {recordType === 'charge' && <div className="grid grid-cols-2 gap-3"><div><label className="block text-sm font-medium text-slate-600 dark:text-slate-300">Период с</label><input aria-label="Период с" type="date" required value={periodStart} onChange={event => setPeriodStart(event.target.value)} className="mt-1 block w-full rounded-md bg-slate-100 px-3 py-2 text-slate-900 dark:bg-slate-800 dark:text-white" /></div><div><label className="block text-sm font-medium text-slate-600 dark:text-slate-300">Период по</label><input aria-label="Период по" type="date" required value={periodEnd} onChange={event => setPeriodEnd(event.target.value)} className="mt-1 block w-full rounded-md bg-slate-100 px-3 py-2 text-slate-900 dark:bg-slate-800 dark:text-white" /></div></div>}
                <div><label className="block text-sm font-medium text-slate-600 dark:text-slate-300">{recordType === 'adjustment' ? 'Причина корректировки' : 'Комментарий'}</label><textarea aria-label={recordType === 'adjustment' ? 'Причина корректировки' : 'Комментарий'} required={recordType === 'adjustment'} value={comment} onChange={event => setComment(event.target.value)} rows={3} placeholder={recordType === 'adjustment' ? 'Почему меняем баланс?' : recordType === 'charge' ? 'Например: аренда завершена раньше' : 'Например: частичная оплата'} className="mt-1 block w-full bg-slate-100 px-3 py-2 text-slate-900 dark:bg-slate-800 dark:text-white" /></div>
                <div className="flex justify-end gap-3 pt-2"><button type="button" onClick={onClose} className="rounded-md px-4 py-2 text-sm text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800">Отмена</button><button type="submit" disabled={loading} className="rounded-md bg-lime-500 px-4 py-2 text-sm font-semibold text-slate-950 hover:bg-lime-400 disabled:opacity-50">Сохранить</button></div>
            </form>
        </div>
    );
}
