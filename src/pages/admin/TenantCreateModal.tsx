import { useState, type ChangeEvent, type FormEvent } from 'react';
import { X } from 'lucide-react';
import type { Bike } from '../../types';
import { createTenant } from '../../features/tenants/api';
import { PAYMENT_DAYS, getPaymentDay } from '../../utils/paymentSchedule';
import { format } from 'date-fns';
import { BATTERY_OPTIONS, getRecommendedWeeklyPrice } from '../../utils/rentalPricing';
import { slugify } from '../../utils/slug';
import { getErrorMessage } from '../../shared/lib/errors';
import toast from 'react-hot-toast';
import { TenantBikeSelector } from './TenantBikeSelector';
import { DateInput } from '../../shared/ui/DateInput';

interface TenantCreateModalProps {
    bikes: Bike[];
    bikesLoading?: boolean;
    onClose: () => void;
    onSuccess: () => void;
}

export function TenantCreateModal({ onClose, onSuccess, bikes, bikesLoading = false }: TenantCreateModalProps) {
    const today = format(new Date(), 'yyyy-MM-dd');
    const [formData, setFormData] = useState({
        name: '', slug: '', bike_id: '', weekly_payment: '', payment_day: getPaymentDay(today),
        next_payment_date: today, deposit: '', phone: '', telegram_username: '', battery_config: ''
    });
    const [loading, setLoading] = useState(false);
    const sortedBikes = [...bikes].sort((a, b) => {
        const statusOrder: Record<string, number> = { available: 0, maintenance: 1, in_rent: 2 };
        return (statusOrder[a.status || ''] ?? 3) - (statusOrder[b.status || ''] ?? 3) || (a.model || '').localeCompare(b.model || '');
    });
    const selectedBike = bikes.find(bike => bike.id === formData.bike_id);
    const recommendedPrice = getRecommendedWeeklyPrice(selectedBike?.type, formData.battery_config);

    const updateForm = (changes: Partial<typeof formData>) => setFormData(current => ({ ...current, ...changes }));
    const handlePaymentDayChange = (event: ChangeEvent<HTMLSelectElement>) => {
        const paymentDay = Number(event.target.value);
        updateForm({ payment_day: paymentDay });
    };
    const handleFirstPaymentDateChange = (nextPaymentDate: string) => {
        updateForm({ next_payment_date: nextPaymentDate, payment_day: nextPaymentDate ? getPaymentDay(nextPaymentDate) : formData.payment_day });
    };
    const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
        event.preventDefault();
        setLoading(true);
        try {
            await createTenant({ ...formData, weekly_payment: Number(formData.weekly_payment) || 0, next_payment_date: formData.next_payment_date });
            onSuccess();
        } catch (error) {
            toast.error(getErrorMessage(error));
        } finally {
            setLoading(false);
        }
    };

    return <div>
        <div className="mb-4 flex items-center justify-between"><h3 className="text-lg font-medium leading-6 text-slate-900 dark:text-white">Новый арендатор</h3><button type="button" onClick={onClose} aria-label="Закрыть" className="rounded-md bg-slate-200/50 p-1 text-slate-500 transition-colors hover:bg-slate-200 hover:text-slate-900 dark:bg-slate-700/50 dark:text-slate-400 dark:hover:bg-slate-700 dark:hover:text-white"><X className="h-5 w-5" /></button></div>
        <form onSubmit={handleSubmit} className="space-y-4">
            <div><label htmlFor="new-tenant-name" className="block text-sm font-medium text-slate-600 dark:text-slate-300">Имя арендатора</label><input id="new-tenant-name" type="text" required value={formData.name} onChange={event => updateForm({ name: event.target.value, slug: slugify(event.target.value) })} className="mt-1 block w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-slate-900 dark:border-slate-600 dark:bg-slate-700 dark:text-white" /></div>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div><label htmlFor="new-tenant-slug" className="block text-sm font-medium text-slate-600 dark:text-slate-300">Псевдоним ссылки</label><div className="mt-1 flex rounded-md"><span className="inline-flex items-center rounded-l-md border border-r-0 border-slate-200 bg-slate-50 px-3 text-slate-500 dark:border-slate-600 dark:bg-slate-700 dark:text-slate-400">/</span><input id="new-tenant-slug" type="text" required value={formData.slug} onChange={event => updateForm({ slug: slugify(event.target.value) })} className="block w-full min-w-0 flex-1 rounded-r-md border border-slate-200 bg-white px-3 py-2 text-slate-900 dark:border-slate-600 dark:bg-slate-700 dark:text-white" placeholder="ivan-123" /></div></div>
                <div><label htmlFor="new-tenant-battery" className="block text-sm font-medium text-slate-600 dark:text-slate-300">Батарея</label><select id="new-tenant-battery" value={formData.battery_config} onChange={event => updateForm({ battery_config: event.target.value })} className="mt-1 block w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-slate-900 dark:border-slate-600 dark:bg-slate-700 dark:text-white"><option value="">Не выбрана</option>{BATTERY_OPTIONS.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}</select>{recommendedPrice != null && <div className="mt-1 flex items-center justify-between text-xs"><span className="text-slate-500 dark:text-slate-400">Рекомендовано: <strong className="text-lime-800 dark:text-lime-300">{recommendedPrice} zł/нед.</strong></span><button type="button" onClick={() => updateForm({ weekly_payment: String(recommendedPrice) })} className="font-semibold text-lime-700 hover:text-lime-600 dark:text-lime-400">Применить</button></div>}</div>
                <div><label htmlFor="new-tenant-bike" className="block text-sm font-medium text-slate-600 dark:text-slate-300">Велосипед</label><TenantBikeSelector bikes={sortedBikes} selectedBikeId={formData.bike_id} onChange={bike_id => updateForm({ bike_id })} disabled={bikesLoading} />{bikesLoading && <p className="mt-1 text-xs text-slate-500">Загружаем доступные велосипеды…</p>}</div>
                <div><label htmlFor="new-tenant-first-payment" className="block text-sm font-medium text-slate-600 dark:text-slate-300">Дата начала аренды</label><DateInput id="new-tenant-first-payment" required value={formData.next_payment_date} onChange={handleFirstPaymentDateChange} className="mt-1 block w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-slate-900 dark:border-slate-600 dark:bg-slate-700 dark:text-white" /><p className="mt-1 text-xs text-slate-500 dark:text-slate-400">Первая неделя начинается в этот день. День оплаты выбирается отдельно.</p></div>
                <div><label htmlFor="new-tenant-payment-day" className="block text-sm font-medium text-slate-600 dark:text-slate-300">День еженедельного платежа</label><select id="new-tenant-payment-day" value={formData.payment_day} onChange={handlePaymentDayChange} className="mt-1 block w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-slate-900 dark:border-slate-600 dark:bg-slate-700 dark:text-white">{PAYMENT_DAYS.map(day => <option key={day.value} value={day.value}>{day.label}</option>)}</select></div>
                <div><label htmlFor="new-tenant-phone" className="block text-sm font-medium text-slate-600 dark:text-slate-300">Телефон</label><input id="new-tenant-phone" type="tel" value={formData.phone} onChange={event => updateForm({ phone: event.target.value })} placeholder="+48 123 456 789" className="mt-1 block w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-slate-900 dark:border-slate-600 dark:bg-slate-700 dark:text-white" /></div>
                <div><label htmlFor="new-tenant-telegram" className="block text-sm font-medium text-slate-600 dark:text-slate-300">Telegram</label><input id="new-tenant-telegram" type="text" value={formData.telegram_username} onChange={event => updateForm({ telegram_username: event.target.value })} placeholder="username или @username" className="mt-1 block w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-slate-900 dark:border-slate-600 dark:bg-slate-700 dark:text-white" /></div>
            </div>
            <div><label htmlFor="new-tenant-weekly-payment" className="block text-sm font-medium text-slate-600 dark:text-slate-300">Еженедельный платеж (zł)</label><input id="new-tenant-weekly-payment" type="number" min="0" required value={formData.weekly_payment} onChange={event => updateForm({ weekly_payment: event.target.value })} className="mt-1 block w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-slate-900 dark:border-slate-600 dark:bg-slate-700 dark:text-white" placeholder="150" /></div>
            <div><label htmlFor="new-tenant-deposit" className="block text-sm font-medium text-slate-600 dark:text-slate-300">Депозит (zł)</label><input id="new-tenant-deposit" type="number" required value={formData.deposit} onChange={event => updateForm({ deposit: event.target.value })} className="mt-1 block w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-slate-900 dark:border-slate-600 dark:bg-slate-700 dark:text-white" placeholder="Стоимость залога" /></div>
            <div className="mt-5 grid grid-flow-row-dense grid-cols-1 gap-3 sm:grid-cols-2"><button type="submit" disabled={loading} className="inline-flex w-full justify-center rounded-md bg-lime-600 px-4 py-2 text-base font-semibold text-slate-950 shadow-sm hover:bg-lime-500 disabled:opacity-50 sm:col-start-2 sm:text-sm">Создать</button><button type="button" onClick={onClose} className="mt-0 inline-flex w-full justify-center rounded-md bg-slate-200 px-4 py-2 text-base font-medium text-slate-800 hover:bg-slate-300 dark:bg-slate-700 dark:text-slate-200 dark:hover:bg-slate-600 sm:col-start-1 sm:text-sm">Отмена</button></div>
        </form>
    </div>;
}
