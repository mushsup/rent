import { useParams, Link, useNavigate } from 'react-router-dom';
import { useState, useEffect, type FormEvent } from 'react';
import { getTenantWeeklyPayment } from '../../utils/calculateDebt';
import { buildPaymentLedger } from '../../utils/paymentLedger';
import { DEFAULT_PAYMENT_DAY, PAYMENT_DAYS, getPaymentDay, getScheduledPaymentDate } from '../../utils/paymentSchedule';
import { ArrowLeft, Edit2, Trash2, Archive, Phone, Send, Sparkles } from 'lucide-react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import type { Bike, DeletableRecord, TenantDetail, TenantEditForm } from '../../types';
import { deleteTenant, deleteTenantRecord, fetchBikes, fetchTenantDetail, setTenantArchived, updateTenantProfile } from '../../features/tenants/api';
import { calculatePaymentBonus } from '../../utils/paymentBonus';
import { BATTERY_OPTIONS, getBatteryLabel, getRecommendedWeeklyPrice } from '../../utils/rentalPricing';
import toast from 'react-hot-toast';
import { getErrorMessage } from '../../shared/lib/errors';
import { queryKeys } from '../../shared/lib/queryKeys';
import { ConfirmDialog, Dialog } from '../../shared/ui';
import { TenantBikeSelector } from './TenantBikeSelector';
import { TenantLedgerModalForm, type LedgerModalEntry } from './TenantLedgerModalForm';
import { AccountingResetModal, DayOffModal, FinishRentalModal } from './TenantRentalModals';
import { TenantBalanceSection } from './TenantBalanceSection';

function normalizeTelegramUsername(value: string | null | undefined): string {
    return (value || '').trim().replace(/^https?:\/\/t\.me\//i, '').replace(/^@/, '');
}

function getPhoneHref(phone: string | null | undefined): string {
    return `tel:${(phone || '').replace(/[^\d+]/g, '')}`;
}

export default function AdminTenantDetail() {
    const { id } = useParams();
    const queryClient = useQueryClient();
    const navigate = useNavigate();

    const [isEditing, setIsEditing] = useState(false);
    const [isLedgerModalOpen, setIsLedgerModalOpen] = useState(false);
    const [editingLedgerEntry, setEditingLedgerEntry] = useState<LedgerModalEntry>(null);
    const [isArchiveModalOpen, setIsArchiveModalOpen] = useState(false);
    const [isFinishRentalModalOpen, setIsFinishRentalModalOpen] = useState(false);
    const [isAccountingResetOpen, setIsAccountingResetOpen] = useState(false);
    const [isDayOffModalOpen, setIsDayOffModalOpen] = useState(false);
    const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
    const [deletingRecord, setDeletingRecord] = useState<DeletableRecord | null>(null);
    const [editForm, setEditForm] = useState<TenantEditForm | null>(null);

    const { data: bikes = [], isError: bikesError } = useQuery<Bike[]>({
        queryKey: queryKeys.bikes.all,
        queryFn: fetchBikes
    });

    const { data: tenant, isLoading: loading, isError: tenantError, error: tenantQueryError } = useQuery<TenantDetail | null>({
        queryKey: id ? queryKeys.tenants.detail(id) : queryKeys.tenants.all,
        queryFn: () => fetchTenantDetail(id!),
        enabled: Boolean(id)
    });

    const invalidateTenantData = () => {
        queryClient.invalidateQueries({ queryKey: id ? queryKeys.tenants.detail(id) : queryKeys.tenants.all });
        queryClient.invalidateQueries({ queryKey: queryKeys.tenants.all });
        queryClient.invalidateQueries({ queryKey: queryKeys.bikes.all });
    };

    useEffect(() => {
        if (tenant && !editForm) {
            setEditForm({ ...tenant, bike_id: tenant.bikes?.id || '', weekly_payment: tenant.weekly_payment ?? '', battery_config: tenant.battery_config || '' });
        }
    }, [tenant, editForm]);

    if (loading) return <div className="text-slate-600 dark:text-slate-300 p-8">Загрузка...</div>;
    if (tenantError || bikesError) return <div className="text-red-400 p-8">Не удалось загрузить арендатора. {tenantQueryError?.message || 'Проверьте подключение к базе данных.'}</div>;
    if (!tenant || !editForm) return <div className="text-red-400 p-8">Арендатор не найден</div>;

    const confirmDeleteRecord = async () => {
        if (!deletingRecord) return;

        try {
            await deleteTenantRecord(deletingRecord, id);
        } catch (error) {
            toast.error(getErrorMessage(error));
            return;
        }

        setDeletingRecord(null);
        invalidateTenantData();
    };

    const handleUpdateTenant = async (e: FormEvent<HTMLFormElement>) => {
        e.preventDefault();
        if (!tenant || !editForm) return;
        const paymentDay = Number(editForm.payment_day) || DEFAULT_PAYMENT_DAY;
        const currentPaymentDay = Number(tenant.payment_day) || getPaymentDay(tenant.next_payment_date || new Date());
        const weeklyPayment = Number(editForm.weekly_payment) || 0;
        const nextPaymentDate = !editForm.bike_id
            ? null
            : paymentDay === currentPaymentDay && tenant.next_payment_date
                ? tenant.next_payment_date
                : getScheduledPaymentDate(tenant.next_payment_date || new Date(), paymentDay);
        try {
            await updateTenantProfile(id!, { ...editForm, payment_day: paymentDay, next_payment_date: nextPaymentDate, weekly_payment: weeklyPayment });
            setIsEditing(false);
            invalidateTenantData();
        } catch (error) {
            toast.error(getErrorMessage(error));
        }
    };

    const confirmToggleArchive = async () => {
        const newArchivedState = !tenant.is_archived;
        try {
            await setTenantArchived(id!, newArchivedState);
            invalidateTenantData();
            navigate('/admin');
        } catch (error) {
            toast.error(getErrorMessage(error));
        }
    };

    const confirmDeleteTenant = async () => {
        try {
            await deleteTenant(id!);
            queryClient.invalidateQueries({ queryKey: queryKeys.tenants.all });
            navigate('/admin');
        } catch (error) {
            toast.error(getErrorMessage(error));
        }
    };

    const paymentLedger = buildPaymentLedger(tenant, tenant.payments);
    const paymentBonus = calculatePaymentBonus(tenant, tenant.payments, tenant.payment_charges);

    const sortedBikes = [...bikes].sort((a, b) => {
            const statusOrder: Record<string, number> = { available: 0, maintenance: 1, in_rent: 2 };
            return (statusOrder[a.status || ''] ?? 3) - (statusOrder[b.status || ''] ?? 3);
        });

    return (
        <div className="max-w-5xl mx-auto font-sans px-2 sm:px-6 py-4 sm:py-6 pb-24">
            <div className="mb-6">
                <Link to="/admin" className="text-sm font-medium text-lime-800 hover:text-lime-700 dark:text-lime-400 dark:hover:text-lime-300 flex items-center">
                    <ArrowLeft className="w-4 h-4 mr-1" /> Вернуться к списку
                </Link>
            </div>

            <div className="bg-white dark:bg-slate-900 rounded-lg shadow-sm border border-slate-200 dark:border-slate-800 overflow-hidden p-4 sm:p-6 relative">
                {!isEditing ? (
                    <>
                        <div className="absolute right-4 top-4 flex items-center gap-2 sm:right-6 sm:top-6">
                            {tenant.bike_id && (
                                <button type="button" onClick={() => setIsFinishRentalModalOpen(true)} className="hidden rounded-lg border border-orange-500/30 bg-orange-950/30 px-3 py-2 text-sm font-medium text-orange-500 transition-colors hover:bg-orange-950/50 sm:inline-flex">
                                    Завершить аренду
                                </button>
                            )}
                            <button aria-label="Редактировать арендатора" onClick={() => setIsEditing(true)} className="rounded-lg bg-slate-200/50 p-2 text-slate-500 transition-colors hover:text-slate-900 dark:bg-slate-700/50 dark:text-slate-400 dark:hover:text-white">
                                <Edit2 className="w-5 h-5" />
                            </button>
                        </div>
                        <h1 className="text-2xl font-bold text-slate-900 dark:text-white pr-10 flex items-center gap-3">
                            {tenant.name}
                            {tenant.is_archived && <span className="bg-slate-200 dark:bg-slate-700 text-slate-600 dark:text-slate-300 px-2.5 py-1 rounded text-xs uppercase font-bold tracking-wider">Архив</span>}
                        </h1>
                        <p className="text-lime-800 dark:text-lime-400 font-medium mt-1">/{tenant.slug} — <span className="text-slate-500 dark:text-slate-400">{tenant.bikes?.model || 'Нет велосипеда'}</span></p>
                        {tenant.bike_id && (
                            <button type="button" onClick={() => setIsFinishRentalModalOpen(true)} className="mt-3 inline-flex rounded-lg border border-orange-500/30 bg-orange-950/30 px-3 py-2 text-sm font-medium text-orange-500 transition-colors hover:bg-orange-950/50 sm:hidden">
                                Завершить аренду
                            </button>
                        )}

                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm mt-6 border-t border-slate-200 dark:border-slate-800 pt-6">
                            <div className="bg-slate-100 dark:bg-slate-700/50 p-3 rounded-lg border border-slate-200 dark:border-slate-800">
                                <span className="block text-slate-500 dark:text-slate-400 mb-1">Ставка в неделю:</span>
                                <span className="font-semibold text-slate-900 dark:text-white text-lg">{getTenantWeeklyPayment(tenant)}&nbsp;zł</span>
                            </div>
                            <div className="bg-slate-100 dark:bg-slate-700/50 p-3 rounded-lg border border-slate-200 dark:border-slate-800">
                                <span className="block text-slate-500 dark:text-slate-400 mb-1">Депозит:</span>
                                <span className="font-semibold text-slate-900 dark:text-white text-lg">{tenant.deposit || 0}&nbsp;zł</span>
                            </div>
                            <div className="bg-slate-100 dark:bg-slate-700/50 p-3 rounded-lg border border-slate-200 dark:border-slate-800">
                                <span className="block text-slate-500 dark:text-slate-400 mb-1">Батарея:</span>
                                <span className="font-semibold text-slate-900 dark:text-white text-lg">{getBatteryLabel(tenant.battery_config)}</span>
                            </div>
                            <div className="bg-slate-100 dark:bg-slate-700/50 p-3 rounded-lg border border-slate-200 dark:border-slate-800">
                                <span className="block text-slate-500 dark:text-slate-400 mb-2">Телефон:</span>
                                {tenant.phone ? (
                                    <a href={getPhoneHref(tenant.phone)} className="inline-flex items-center gap-2 font-semibold text-lime-800 hover:text-lime-700 dark:text-lime-400 dark:hover:text-lime-300">
                                        <Phone className="h-4 w-4" /> {tenant.phone}
                                    </a>
                                ) : <span className="text-slate-500 dark:text-slate-400">Не указан</span>}
                            </div>
                            <div className="bg-slate-100 dark:bg-slate-700/50 p-3 rounded-lg border border-slate-200 dark:border-slate-800">
                                <span className="block text-slate-500 dark:text-slate-400 mb-2">Telegram:</span>
                                {tenant.telegram_username ? (
                                    <a href={`https://t.me/${normalizeTelegramUsername(tenant.telegram_username)}`} target="_blank" rel="noreferrer" className="inline-flex items-center gap-2 font-semibold text-lime-800 hover:text-lime-700 dark:text-lime-400 dark:hover:text-lime-300">
                                        <Send className="h-4 w-4" /> @{normalizeTelegramUsername(tenant.telegram_username)}
                                    </a>
                                ) : <span className="text-slate-500 dark:text-slate-400">Не указан</span>}
                            </div>
                            <div className="sm:col-span-2 bg-teal-900/10 border border-teal-900/30 p-4 rounded-lg">
                                <span className="block text-slate-500 dark:text-slate-400 mb-1 text-xs uppercase tracking-wider">Заметка администратора</span>
                                <span className="text-slate-600 dark:text-slate-300 whitespace-pre-line">{tenant.admin_comment || 'Нет комментария'}</span>
                            </div>
                            <div className="sm:col-span-2 rounded-lg border border-lime-500/20 bg-lime-500/5 p-4">
                                <div className="flex items-center justify-between gap-3">
                                    <span className="flex items-center gap-2 text-sm font-medium text-slate-600 dark:text-slate-300"><Sparkles className="h-4 w-4 text-lime-500" /> Бонус за своевременную оплату</span>
                                    <span className="font-bold text-lime-700 dark:text-lime-400">−{Number(tenant.discount_amount || 0)} zł</span>
                                </div>
                                <div className="mt-3 flex gap-1.5" aria-label={`Накоплено ${paymentBonus.streakWeeks} из 4 недель`}>
                                    {[0, 1, 2, 3].map(step => <span key={step} className={`h-2 flex-1 rounded-full ${step < paymentBonus.streakWeeks ? 'bg-lime-500' : 'bg-slate-200 dark:bg-slate-700'}`} />)}
                                </div>
                                <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">{paymentBonus.streakWeeks}/4 оплат вовремя · скидку можно изменить в условиях аренды</p>
                            </div>
                        </div>
                    </>
                ) : (
                    <form onSubmit={handleUpdateTenant} className="space-y-4">
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                            <div>
                                <label className="block text-sm font-medium text-slate-600 dark:text-slate-300">Имя</label>
                                <input type="text" value={editForm.name} onChange={e => setEditForm({ ...editForm, name: e.target.value })} className="mt-1 block w-full rounded-md bg-slate-200 dark:bg-slate-700 border border-slate-400 dark:border-slate-600 text-slate-900 dark:text-white py-2 px-3 focus:border-lime-500 focus:ring-1 focus:ring-lime-500 sm:text-sm" />
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-slate-600 dark:text-slate-300">Велосипед</label>
                                <TenantBikeSelector
                                    bikes={sortedBikes}
                                    selectedBikeId={editForm.bike_id}
                                    onChange={(bikeId) => {
                                        if (!bikeId && tenant.bike_id) {
                                            setIsFinishRentalModalOpen(true);
                                            return;
                                        }
                                        setEditForm({ ...editForm, bike_id: bikeId });
                                    }}
                                />
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-slate-600 dark:text-slate-300">Псевдоним ссылки</label>
                                <div className="mt-1 flex rounded-md shadow-sm">
                                    <span className="inline-flex items-center rounded-l-md border border-r-0 border-slate-400 dark:border-slate-600 bg-slate-200 dark:bg-slate-700 px-3 text-slate-500 dark:text-slate-400 sm:text-sm">/</span>
                                    <input type="text" value={editForm.slug} onChange={e => setEditForm({ ...editForm, slug: e.target.value })} className="block w-full min-w-0 flex-1 rounded-none rounded-r-md bg-slate-200 dark:bg-slate-700 border border-slate-400 dark:border-slate-600 text-slate-900 dark:text-white py-2 px-3 focus:outline-none focus:border-lime-500 focus:ring-1 focus:ring-lime-500 sm:text-sm" />
                                </div>
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-slate-600 dark:text-slate-300">Депозит (zł)</label>
                                <input type="number" value={editForm.deposit || ''} onChange={e => setEditForm({ ...editForm, deposit: e.target.value })} className="mt-1 block w-full rounded-md bg-slate-200 dark:bg-slate-700 border border-slate-400 dark:border-slate-600 text-slate-900 dark:text-white py-2 px-3 focus:outline-none focus:border-lime-500 focus:ring-1 focus:ring-lime-500 sm:text-sm" />
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-slate-600 dark:text-slate-300">Телефон</label>
                                <input type="tel" value={editForm.phone || ''} onChange={e => setEditForm({ ...editForm, phone: e.target.value })} placeholder="+48 123 456 789" className="mt-1 block w-full rounded-md bg-slate-200 dark:bg-slate-700 border border-slate-400 dark:border-slate-600 text-slate-900 dark:text-white py-2 px-3 focus:outline-none focus:border-lime-500 focus:ring-1 focus:ring-lime-500 sm:text-sm" />
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-slate-600 dark:text-slate-300">Telegram</label>
                                <input type="text" value={editForm.telegram_username || ''} onChange={e => setEditForm({ ...editForm, telegram_username: e.target.value })} placeholder="username или @username" className="mt-1 block w-full rounded-md bg-slate-200 dark:bg-slate-700 border border-slate-400 dark:border-slate-600 text-slate-900 dark:text-white py-2 px-3 focus:outline-none focus:border-lime-500 focus:ring-1 focus:ring-lime-500 sm:text-sm" />
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-slate-600 dark:text-slate-300">Еженедельный платеж (zł)</label>
                                <input type="number" min="0" value={editForm.weekly_payment || ''} onChange={e => setEditForm({ ...editForm, weekly_payment: e.target.value })} className="mt-1 block w-full rounded-md bg-slate-200 dark:bg-slate-700 border border-slate-400 dark:border-slate-600 text-slate-900 dark:text-white py-2 px-3 focus:border-lime-500 focus:ring-1 focus:ring-lime-500 sm:text-sm" />
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-slate-600 dark:text-slate-300">Постоянная скидка (zł/нед.)</label>
                                <input type="number" min="0" max="20" step="5" value={editForm.discount_amount || 0} onChange={e => setEditForm({ ...editForm, discount_amount: Number(e.target.value) || 0 })} className="mt-1 block w-full rounded-md bg-slate-200 dark:bg-slate-700 border border-slate-400 dark:border-slate-600 text-slate-900 dark:text-white py-2 px-3 focus:border-lime-500 focus:ring-1 focus:ring-lime-500 sm:text-sm" />
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-slate-600 dark:text-slate-300">Батарея</label>
                                <select value={editForm.battery_config || ''} onChange={e => setEditForm({ ...editForm, battery_config: e.target.value })} className="mt-1 block w-full rounded-md bg-slate-200 dark:bg-slate-700 border border-slate-400 dark:border-slate-600 text-slate-900 dark:text-white py-2 px-3 focus:border-lime-500 focus:ring-1 focus:ring-lime-500 sm:text-sm">
                                    <option value="">Не выбрана</option>{BATTERY_OPTIONS.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}
                                </select>
                                {editForm.battery_config && <div className="mt-2 flex items-center justify-between gap-2 text-xs"><span className="text-slate-500 dark:text-slate-400">Рекомендованная цена: <strong className="text-lime-700 dark:text-lime-400">{getRecommendedWeeklyPrice(sortedBikes.find(bike => bike.id === editForm.bike_id)?.type || editForm.bikes?.type, editForm.battery_config) ?? '—'} zł/нед.</strong></span><button type="button" onClick={() => { const recommended = getRecommendedWeeklyPrice(sortedBikes.find(bike => bike.id === editForm.bike_id)?.type || editForm.bikes?.type, editForm.battery_config); if (recommended != null) setEditForm({ ...editForm, weekly_payment: recommended }); }} className="font-semibold text-lime-700 hover:text-lime-600 dark:text-lime-400">Применить</button></div>}
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-slate-600 dark:text-slate-300">День еженедельного платежа</label>
                                <select value={editForm.payment_day || DEFAULT_PAYMENT_DAY} onChange={e => setEditForm({ ...editForm, payment_day: Number(e.target.value) })} className="mt-1 block w-full rounded-md bg-slate-200 dark:bg-slate-700 border border-slate-400 dark:border-slate-600 text-slate-900 dark:text-white py-2 px-3 focus:border-lime-500 focus:ring-1 focus:ring-lime-500 sm:text-sm">
                                    {PAYMENT_DAYS.map(day => <option key={day.value} value={day.value}>{day.label}</option>)}
                                </select>
                            </div>
                            <div className="sm:col-span-2">
                                <label className="block text-sm font-medium text-slate-600 dark:text-slate-300">Комментарий (видно арендатору)</label>
                                <textarea value={editForm.admin_comment || ''} onChange={e => setEditForm({ ...editForm, admin_comment: e.target.value })} className="mt-1 block w-full rounded-md bg-slate-200 dark:bg-slate-700 border border-slate-400 dark:border-slate-600 text-slate-900 dark:text-white py-2 px-3 focus:border-lime-500 focus:ring-1 focus:ring-lime-500 sm:text-sm" rows={3} />
                            </div>
                        </div>

                        <div className="mt-8 pt-6 border-t border-slate-700/50">
                            <h3 className="text-sm font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-4">Опасная зона</h3>
                            <div className="flex flex-col sm:flex-row gap-4">
                                <button type="button" onClick={() => setIsArchiveModalOpen(true)} className="flex items-center justify-center px-4 py-2 border border-orange-700/50 bg-orange-900/20 text-orange-400 rounded-md hover:bg-orange-900/40 transition-colors">
                                    <Archive className="w-4 h-4 mr-2" />
                                    {tenant.is_archived ? "Вернуть из архива" : "Отправить в архив"}
                                </button>
                                <button type="button" onClick={() => setIsDeleteModalOpen(true)} className="flex items-center justify-center px-4 py-2 border border-red-700/50 bg-red-900/20 text-red-400 rounded-md hover:bg-red-900/40 transition-colors">
                                    <Trash2 className="w-4 h-4 mr-2" />
                                    Удалить арендатора
                                </button>
                            </div>
                        </div>
                        <div className="flex justify-end space-x-3 mt-4 pt-4 border-t border-slate-200 dark:border-slate-800">
                            <button type="button" onClick={() => setIsEditing(false)} className="rounded-md border border-slate-400 dark:border-slate-600 bg-slate-200 dark:bg-slate-700 py-2 px-4 shadow-sm text-sm font-medium text-slate-600 dark:text-slate-300 hover:bg-slate-600 transition-colors">Отмена</button>
                            <button type="submit" className="rounded-md border border-transparent bg-lime-600 py-2 px-4 shadow-sm text-sm font-semibold text-slate-950 hover:bg-lime-500 transition-colors">Сохранить</button>
                        </div>
                    </form>
                )}
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mt-6">
                <TenantBalanceSection
                    ledger={paymentLedger}
                    tenantId={id!}
                    onAddEntry={() => { setEditingLedgerEntry({ type: 'payment', value: null }); setIsLedgerModalOpen(true); }}
                    onAddDayOff={() => setIsDayOffModalOpen(true)}
                    onResetAccounting={() => setIsAccountingResetOpen(true)}
                    onEditEntry={(entry) => {
                        setEditingLedgerEntry({
                            type: 'charge',
                            value: {
                                ...entry.charge,
                                id: entry.charge?.id,
                                due_date: entry.dateKey,
                                period_start: entry.charge?.period_start || entry.dateKey,
                                period_end: entry.charge?.period_end || entry.dateKey,
                                amount: entry.amount,
                                comment: entry.comment,
                                status: entry.charge?.status || 'open',
                            },
                        });
                        setIsLedgerModalOpen(true);
                    }}
                />
            </div>

            <ConfirmDialog
                open={Boolean(deletingRecord)}
                title={`Удалить ${deletingRecord?.type === 'adjustment' ? 'корректировку' : deletingRecord?.type === 'charge' ? 'начисление' : 'платеж'}?`}
                description="Эта операция удалит запись из истории. Баланс арендатора будет пересчитан. Отменить действие будет невозможно."
                onCancel={() => setDeletingRecord(null)}
                onConfirm={confirmDeleteRecord}
            />

            <Dialog open={isLedgerModalOpen} ariaLabel="Запись в журнале платежей" size="sm" onClose={() => setIsLedgerModalOpen(false)}>
                <TenantLedgerModalForm entry={editingLedgerEntry} tenant={tenant} onClose={() => setIsLedgerModalOpen(false)} onSuccess={() => { setIsLedgerModalOpen(false); invalidateTenantData(); }} />
            </Dialog>

            {isFinishRentalModalOpen && (
                <FinishRentalModal
                    tenant={tenant}
                    onClose={() => setIsFinishRentalModalOpen(false)}
                    onSuccess={() => {
                        setIsFinishRentalModalOpen(false);
                        setIsEditing(false);
                        setEditForm(null);
                        invalidateTenantData();
                    }}
                />
            )}

            {isAccountingResetOpen && <AccountingResetModal tenant={tenant} onClose={() => setIsAccountingResetOpen(false)} onSuccess={() => { setIsAccountingResetOpen(false); setEditForm(null); invalidateTenantData(); }} />}

            {isDayOffModalOpen && <DayOffModal tenant={tenant} onClose={() => setIsDayOffModalOpen(false)} onSuccess={() => { setIsDayOffModalOpen(false); setEditForm(null); invalidateTenantData(); }} />}

            <ConfirmDialog
                open={isArchiveModalOpen}
                title={tenant.is_archived ? 'Вернуть из архива?' : 'В архив?'}
                description={tenant.is_archived
                    ? 'Арендатор снова появится в общем списке активных клиентов.'
                    : 'Арендатор будет скрыт, велосипед станет свободным, а будущие автоматические начисления остановятся.'}
                confirmLabel={tenant.is_archived ? 'Вернуть' : 'В архив'}
                confirmVariant="primary"
                onCancel={() => setIsArchiveModalOpen(false)}
                onConfirm={confirmToggleArchive}
            />

            <ConfirmDialog
                open={isDeleteModalOpen}
                title="Удалить арендатора?"
                description="Вы уверены, что хотите полностью удалить этого арендатора? Это действие необратимо и удалит все связанные платежи."
                onCancel={() => setIsDeleteModalOpen(false)}
                onConfirm={confirmDeleteTenant}
            />



        </div>
    );
}
