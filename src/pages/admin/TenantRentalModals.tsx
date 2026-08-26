import { useState, type FormEvent, type ReactNode } from 'react';
import { format, parseISO } from 'date-fns';
import { X } from 'lucide-react';
import type { TenantDetail } from '../../types';
import { addTenantDayOff, finishTenantRental, resetTenantAccounting } from '../../features/tenants/api';
import { DEFAULT_PAYMENT_DAY, PAYMENT_DAYS } from '../../utils/paymentSchedule';
import { getRentalEndPreview } from '../../utils/rentalEnd';
import { getErrorMessage } from '../../shared/lib/errors';
import { Dialog } from '../../shared/ui';
import toast from 'react-hot-toast';

interface TenantRentalModalProps {
    tenant: TenantDetail;
    onClose: () => void;
    onSuccess: () => void;
}

export function AccountingResetModal({ tenant, onClose, onSuccess }: TenantRentalModalProps) {
    const today = format(new Date(), 'yyyy-MM-dd');
    const [openingBalance, setOpeningBalance] = useState(String(tenant.opening_balance ?? 0));
    const [startDate, setStartDate] = useState(tenant.accounting_start_date || today);
    const [nextPaymentDate, setNextPaymentDate] = useState(tenant.next_payment_date || today);
    const [weeklyPayment, setWeeklyPayment] = useState(String(tenant.weekly_payment ?? ''));
    const [paymentDay, setPaymentDay] = useState(String(tenant.payment_day || DEFAULT_PAYMENT_DAY));
    const [loading, setLoading] = useState(false);

    const submit = async (event: FormEvent<HTMLFormElement>) => {
        event.preventDefault();
        setLoading(true);
        try {
            await resetTenantAccounting(tenant.id, {
                opening_balance: Number(openingBalance) || 0,
                accounting_start_date: startDate,
                next_payment_date: nextPaymentDate,
                weekly_payment: Number(weeklyPayment) || 0,
                payment_day: Number(paymentDay),
            });
            toast.success('Финансовый старт сохранён');
            onSuccess();
        } catch (error) {
            toast.error(getErrorMessage(error));
        } finally {
            setLoading(false);
        }
    };

    return <ModalShell onClose={onClose} ariaLabel="Новый финансовый старт">
        <div className="flex items-start justify-between gap-4"><div><p className="text-xs font-semibold uppercase tracking-[0.16em] text-orange-400">Чистый учёт</p><h2 className="mt-1 text-xl font-bold">Новый финансовый старт</h2><p className="mt-2 text-sm text-slate-400">Старые платежи, начисления и корректировки будут удалены для {tenant.name}.</p></div><CloseButton onClose={onClose} /></div>
        <form onSubmit={submit} className="mt-6 space-y-4">
            <label className="block text-sm font-medium text-slate-300">Стартовый долг (zł)<input required min="0" step="0.01" type="number" value={openingBalance} onChange={event => setOpeningBalance(event.target.value)} className={inputClass} /></label>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2"><label className="block text-sm font-medium text-slate-300">Дата старта<input required type="date" value={startDate} onChange={event => setStartDate(event.target.value)} className={inputClass} /></label><label className="block text-sm font-medium text-slate-300">Следующий платёж<input required type="date" value={nextPaymentDate} onChange={event => setNextPaymentDate(event.target.value)} className={inputClass} /></label></div>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2"><label className="block text-sm font-medium text-slate-300">Ставка в неделю (zł)<input required min="0" step="0.01" type="number" value={weeklyPayment} onChange={event => setWeeklyPayment(event.target.value)} className={inputClass} /></label><label className="block text-sm font-medium text-slate-300">День платежа<select value={paymentDay} onChange={event => setPaymentDay(event.target.value)} className={inputClass}>{PAYMENT_DAYS.map(day => <option key={day.value} value={day.value}>{day.label}</option>)}</select></label></div>
            <div className="rounded-lg border border-orange-900/50 bg-orange-950/30 px-3 py-2.5 text-xs leading-relaxed text-orange-200">Это действие необратимо для старого журнала этого арендатора. После сохранения баланс начнётся со стартовой суммы.</div>
            <ModalActions onClose={onClose} loading={loading} submitLabel="Начать чистый учёт" />
        </form>
    </ModalShell>;
}

export function FinishRentalModal({ tenant, onClose, onSuccess }: TenantRentalModalProps) {
    const today = format(new Date(), 'yyyy-MM-dd');
    const initialPreview = getRentalEndPreview(tenant, today);
    const [endDate, setEndDate] = useState(today);
    const [finalAmount, setFinalAmount] = useState(String(initialPreview.suggestedAmount));
    const [reason, setReason] = useState('');
    const [amountWasEdited, setAmountWasEdited] = useState(false);
    const [loading, setLoading] = useState(false);
    const preview = getRentalEndPreview(tenant, endDate || today);

    const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
        event.preventDefault();
        if (!reason.trim()) { toast.error('Укажите причину завершения аренды'); return; }
        setLoading(true);
        try {
            await finishTenantRental(tenant.id, endDate, Number(finalAmount), reason);
            toast.success('Аренда завершена, велосипед освобождён');
            onSuccess();
        } catch (error) {
            toast.error(getErrorMessage(error));
        } finally {
            setLoading(false);
        }
    };

    const handleDateChange = (value: string) => {
        setEndDate(value);
        if (value && !amountWasEdited) setFinalAmount(String(getRentalEndPreview(tenant, value).suggestedAmount));
    };

    return <ModalShell onClose={onClose} ariaLabel="Завершить аренду">
        <CloseButton onClose={onClose} />
        <div className="pr-10"><p className="text-xs font-semibold uppercase tracking-[0.16em] text-orange-400">Финальный расчёт</p><h2 className="mt-1 text-xl font-bold">Завершить аренду</h2><p className="mt-2 text-sm text-slate-400">{tenant.name} · {tenant.bikes?.model}</p></div>
        <form onSubmit={handleSubmit} className="mt-6 space-y-5">
            <label className="block text-sm font-medium text-slate-300">Дата возврата<input aria-label="Дата возврата" type="date" max={today} required value={endDate} onChange={event => handleDateChange(event.target.value)} className={`${inputClass} focus:border-orange-500 focus:ring-orange-500`} /></label>
            <div className="rounded-xl border border-slate-800 bg-black/50 p-4"><div className="flex items-center justify-between gap-3"><span className="text-sm text-slate-400">Расчётный период</span><span className="text-sm font-semibold text-slate-100">{format(parseISO(preview.periodStart), 'dd.MM.yy')}–{format(parseISO(preview.periodEnd), 'dd.MM.yy')}</span></div><div className="mt-3 flex items-center justify-between gap-3"><span className="text-sm text-slate-400">Использовано</span><span className="text-sm font-semibold text-slate-100">{preview.usedDays} из {preview.totalDays} дней</span></div><div className="mt-3 h-2 overflow-hidden rounded-full bg-slate-800"><div className="h-full rounded-full bg-orange-500" style={{ width: `${Math.min(preview.usedDays / preview.totalDays * 100, 100)}%` }} /></div><div className="mt-3 flex items-center justify-between gap-3 border-t border-slate-800 pt-3"><span className="text-sm text-slate-400">Предлагаемая сумма</span><span className="text-lg font-bold text-orange-400">{preview.suggestedAmount} zł</span></div></div>
            <label className="block text-sm font-medium text-slate-300">Финальная сумма (zł)<input aria-label="Финальная сумма (zł)" type="number" min="0" step="0.01" required value={finalAmount} onChange={event => { setAmountWasEdited(true); setFinalAmount(event.target.value); }} className={`${inputClass} focus:border-orange-500 focus:ring-orange-500`} /><span className="mt-1.5 block text-xs text-slate-500">Можно изменить вручную, включая 0 zł.</span></label>
            <label className="block text-sm font-medium text-slate-300">Причина завершения<textarea aria-label="Причина завершения" required rows={3} value={reason} onChange={event => setReason(event.target.value)} placeholder="Например: велосипед возвращён досрочно" className={`${inputClass} focus:border-orange-500 focus:ring-orange-500`} /></label>
            <div className="rounded-lg border border-orange-900/50 bg-orange-950/30 px-3 py-2.5 text-xs leading-relaxed text-orange-200">После подтверждения велосипед станет свободным, будущие начисления остановятся, а финальная сумма появится в журнале.</div>
            <ModalActions onClose={onClose} loading={loading} submitLabel="Завершить аренду" loadingLabel="Завершаем…" />
        </form>
    </ModalShell>;
}

export function DayOffModal({ tenant, onClose, onSuccess }: TenantRentalModalProps) {
    const today = format(new Date(), 'yyyy-MM-dd');
    const [date, setDate] = useState(today);
    const [reason, setReason] = useState('Выходной арендатора');
    const [loading, setLoading] = useState(false);
    const dailyCredit = Math.round(Math.max(Number(tenant.weekly_payment) - Number(tenant.discount_amount || 0), 0) / 7 * 100) / 100;

    const submit = async (event: FormEvent<HTMLFormElement>) => {
        event.preventDefault();
        setLoading(true);
        try {
            await addTenantDayOff(tenant.id, date, reason);
            toast.success(`Выходной добавлен · скидка ${dailyCredit} zł`);
            onSuccess();
        } catch (error) {
            toast.error(getErrorMessage(error));
        } finally {
            setLoading(false);
        }
    };

    return <ModalShell onClose={onClose} ariaLabel="Добавить выходной">
        <CloseButton onClose={onClose} />
        <div className="pr-10"><p className="text-xs font-semibold uppercase tracking-[0.16em] text-sky-400">Событие аренды</p><h2 className="mt-1 text-xl font-bold">Добавить выходной</h2><p className="mt-2 text-sm text-slate-400">День появится в журнале, а баланс уменьшится на дневную стоимость.</p></div>
        <form onSubmit={submit} className="mt-6 space-y-4">
            <label className="block text-sm font-medium text-slate-300">Дата<input required type="date" value={date} onChange={event => setDate(event.target.value)} className={inputClass} /></label>
            <label className="block text-sm font-medium text-slate-300">Причина<textarea required rows={3} value={reason} onChange={event => setReason(event.target.value)} className={inputClass} /></label>
            <div className="rounded-xl border border-sky-900/50 bg-sky-950/30 p-4"><div className="flex items-center justify-between"><span className="text-sm text-slate-400">Кредит за один день</span><span className="text-lg font-bold text-sky-300">−{dailyCredit} zł</span></div><p className="mt-2 text-xs text-slate-500">Расчёт: (тариф − постоянная скидка) ÷ 7. Точная сумма определяется сервером по условиям на выбранную дату.</p></div>
            <ModalActions onClose={onClose} loading={loading} submitLabel="Добавить выходной" />
        </form>
    </ModalShell>;
}

const inputClass = 'mt-1.5 block w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2.5 text-white';

function ModalShell({ children, onClose, ariaLabel }: { children: ReactNode; onClose: () => void; ariaLabel: string }) {
    return <Dialog open ariaLabel={ariaLabel} onClose={onClose} className="rounded-2xl border-slate-700 bg-slate-950 p-5 text-white sm:p-6">{children}</Dialog>;
}

function CloseButton({ onClose }: { onClose: () => void }) {
    return <button type="button" onClick={onClose} aria-label="Закрыть" className="absolute right-4 top-4 rounded-lg p-1.5 text-slate-400 transition-colors hover:bg-slate-800 hover:text-white"><X className="h-5 w-5" /></button>;
}

function ModalActions({ onClose, loading, submitLabel, loadingLabel = 'Сохраняем…' }: { onClose: () => void; loading: boolean; submitLabel: string; loadingLabel?: string }) {
    return <div className="flex justify-end gap-3 pt-1"><button type="button" onClick={onClose} className="rounded-lg px-4 py-2.5 text-sm font-medium text-slate-300 hover:bg-slate-800">Отмена</button><button type="submit" disabled={loading} className="rounded-lg bg-orange-500 px-4 py-2.5 text-sm font-bold text-slate-950 hover:bg-orange-400 disabled:opacity-50">{loading ? loadingLabel : submitLabel}</button></div>;
}
