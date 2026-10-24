import type { Dispatch, FormEvent, SetStateAction } from 'react';
import type { Credit, CreditTransaction, CreditType } from '../../types';
import { Dialog } from '../../shared/ui';
import { DateInput } from '../../shared/ui/DateInput';
import { useI18n } from '../../i18n';

export interface CreditFormData {
    name: string;
    start_date: string;
    type: CreditType;
    amount: string;
    interest_rate: string;
}

export interface TransactionFormData {
    amount: string;
    date: string;
}

type FormState<T> = Dispatch<SetStateAction<T>>;

interface CreditModalProps {
    credit: Credit | null;
    formData: CreditFormData;
    setFormData: FormState<CreditFormData>;
    onClose: () => void;
    onSubmit: (event: FormEvent<HTMLFormElement>) => void;
    busy?: boolean;
}

export function CreditModal({ credit, formData, setFormData, onClose, onSubmit, busy = false }: CreditModalProps) {
    const { t } = useI18n();
    return <Dialog open title={credit ? t('Редактировать кредит') : t('Новый кредит')} onClose={onClose}>
            <form onSubmit={onSubmit} className="space-y-4">
                <label className={labelClass}>{t('Название')}<input type="text" required value={formData.name} onChange={event => setFormData(current => ({ ...current, name: event.target.value }))} className={inputClass} placeholder={t('Например: Кредит на велосипеды')} /></label>
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2"><label className={labelClass}>{t('Начальная сумма (€)')}<input type="number" required min="0" step="0.01" value={formData.amount} onChange={event => setFormData(current => ({ ...current, amount: event.target.value }))} className={inputClass} /></label><label className={labelClass}>{t('Дата получения')}<DateInput required aria-label={t('Дата получения')} value={formData.start_date} onChange={value => setFormData(current => ({ ...current, start_date: value }))} className={inputClass} /></label></div>
                <label className={labelClass}>{t('Тип кредита')}<select value={formData.type} onChange={event => setFormData(current => ({ ...current, type: event.target.value as CreditType }))} className={inputClass}><option value="no_interest">{t('Без процентов')}</option><option value="interest">{t('С процентами')}</option></select></label>
                {formData.type === 'interest' && <label className={labelClass}>{t('Процент (годовых, %)')}<input type="number" required min="0" step="0.01" value={formData.interest_rate} onChange={event => setFormData(current => ({ ...current, interest_rate: event.target.value }))} className={inputClass} placeholder={t('Например: 10')} /></label>}
                <p className="text-xs text-slate-500 dark:text-slate-400">{t('Регулярный график платежей по кредиту не настроен: остаток считается по фактическим операциям.')}</p>
                <Actions onClose={onClose} submitLabel={t('Сохранить')} busy={busy} />
            </form>
    </Dialog>;
}

interface TransactionModalProps {
    transaction: CreditTransaction | null;
    transactionType: string;
    transactionData: TransactionFormData;
    setTransactionData: FormState<TransactionFormData>;
    onClose: () => void;
    onSubmit: (event: FormEvent<HTMLFormElement>) => void;
    busy?: boolean;
}

export function TransactionModal({ transaction, transactionType, transactionData, setTransactionData, onClose, onSubmit, busy = false }: TransactionModalProps) {
    const { t } = useI18n();
    return <Dialog open title={transaction ? t('Редактировать операцию') : transactionType === 'payment' ? t('Добавить платеж') : t('Добор кредита')} onClose={onClose}>
            <form onSubmit={onSubmit} className="space-y-4">
                <label className={labelClass}>{t('Сумма (€)')}<input type="number" required min="0.01" step="0.0001" value={transactionData.amount} onChange={event => setTransactionData(current => ({ ...current, amount: event.target.value }))} className={inputClass} /></label>
                <label className={labelClass}>{t('Дата')}<DateInput required aria-label={t('Дата')} value={transactionData.date} onChange={value => setTransactionData(current => ({ ...current, date: value }))} className={inputClass} /></label>
                <Actions onClose={onClose} submitLabel={t(transaction ? 'Обновить' : transactionType === 'payment' ? 'Оплатить' : 'Добавить')} accent={transactionType === 'payment' ? 'lime' : 'secondary'} busy={busy} />
            </form>
    </Dialog>;
}

function Actions({ onClose, submitLabel, accent = 'lime', busy = false }: { onClose: () => void; submitLabel: string; accent?: 'lime' | 'secondary'; busy?: boolean }) {
    const { t } = useI18n();
    const accentClass = { lime: 'bg-lime-500 hover:bg-lime-400 text-slate-950', secondary: 'bg-slate-200 hover:bg-slate-300 text-slate-800 dark:bg-slate-700 dark:text-slate-200 dark:hover:bg-slate-600' }[accent];
    return <div className="mt-6 flex flex-col-reverse gap-2 pt-2 sm:flex-row sm:justify-end sm:gap-3"><button type="button" onClick={onClose} disabled={busy} className="rounded-lg px-4 py-2 text-sm font-medium text-slate-600 transition-colors hover:bg-slate-100 disabled:opacity-50 dark:text-slate-300 dark:hover:bg-slate-800">{t('Отмена')}</button><button type="submit" disabled={busy} className={`rounded-lg px-4 py-2 text-sm font-semibold transition disabled:opacity-50 ${accentClass}`}>{busy ? t('Сохранение…') : submitLabel}</button></div>;
}

const labelClass = 'block text-sm font-medium text-slate-600 dark:text-slate-300';
const inputClass = 'mt-1 block w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-slate-900 focus:border-lime-500 focus:outline-none focus:ring-1 focus:ring-lime-500 dark:border-slate-700 dark:bg-slate-950 dark:text-white';
