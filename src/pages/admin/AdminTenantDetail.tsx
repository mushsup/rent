import { useParams, Link, useNavigate } from 'react-router-dom';
import { useState, useEffect, type FormEvent } from 'react';
import { getTenantWeeklyPayment } from '../../utils/calculateDebt';
import { buildPaymentLedger } from '../../utils/paymentLedger';
import { DEFAULT_PAYMENT_DAY, PAYMENT_DAYS, getPaymentDay, getScheduledPaymentDate, normalizePaymentDay } from '../../utils/paymentSchedule';
import { ArrowLeft, Edit2, Trash2, Archive, Phone, Send } from 'lucide-react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import type { Battery, Bike, DeletableRecord, RentalEvent, TenantDetail, TenantEditForm } from '../../types';
import { approveTenantPaymentCharge, deleteTenant, deleteTenantRecord, fetchBikes, fetchTenantDetail, setTenantArchived, updateTenantProfile } from '../../features/tenants/api';
import { BATTERY_CAPACITY_OPTIONS, getBatteryLabel, getRecommendedWeeklyPrice, parseBatteryConfig, serializeBatteryConfig, type BatteryAssignment } from '../../utils/rentalPricing';
import { fetchBatteries, saveBattery } from '../../features/bikes/api';
import toast from 'react-hot-toast';
import { getErrorMessage } from '../../shared/lib/errors';
import { queryKeys } from '../../shared/lib/queryKeys';
import { ConfirmDialog, Dialog, EmptyState, ErrorState, LoadingState } from '../../shared/ui';
import { TenantBikeSelector } from './TenantBikeSelector';
import { TenantLedgerModalForm, type LedgerModalEntry } from './TenantLedgerModalForm';
import { RentalEndModal } from './TenantRentalModals';
import { TenantBalanceSection } from './TenantBalanceSection';

function normalizeTelegramUsername(value: string | null | undefined): string {
    return (value || '').trim().replace(/^https?:\/\/t\.me\//i, '').replace(/^@/, '');
}

function getPhoneHref(phone: string | null | undefined): string {
    return `tel:${(phone || '').replace(/[^\d+]/g, '')}`;
}

function getTelegramMessage(debt: number): string {
    const debtText = debt > 0 ? `У тебя висит долг: ${Math.round(debt * 100) / 100} zł.` : 'Задолженности нет.';
    return `Привет! Сегодня день оплаты. ${debtText}`;
}

export default function AdminTenantDetail() {
    const { id } = useParams();
    const queryClient = useQueryClient();
    const navigate = useNavigate();

    const [isEditing, setIsEditing] = useState(false);
    const [isLedgerModalOpen, setIsLedgerModalOpen] = useState(false);
    const [editingLedgerEntry, setEditingLedgerEntry] = useState<LedgerModalEntry>(null);
    const [isArchiveModalOpen, setIsArchiveModalOpen] = useState(false);
    const [rentalEndEvent, setRentalEndEvent] = useState<RentalEvent | null | undefined>(undefined);
    const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
    const [deletingRecord, setDeletingRecord] = useState<DeletableRecord | null>(null);
    const [editForm, setEditForm] = useState<TenantEditForm | null>(null);
    const [batteryAssignments, setBatteryAssignments] = useState<BatteryAssignment[]>([]);
    const [customBatteryIndex, setCustomBatteryIndex] = useState<number | null>(null);
    const [customBatteryCode, setCustomBatteryCode] = useState('');
    const [customBatterySaving, setCustomBatterySaving] = useState(false);

    const { data: bikes = [], isError: bikesError } = useQuery<Bike[]>({
        queryKey: queryKeys.bikes.all,
        queryFn: fetchBikes
    });
    const { data: batteries = [] } = useQuery<Battery[]>({
        queryKey: queryKeys.batteries.all,
        queryFn: fetchBatteries,
    });

    const { data: tenant, isLoading: loading, isError: tenantError, error: tenantQueryError } = useQuery<TenantDetail | null>({
        queryKey: id ? queryKeys.tenants.detail(id) : queryKeys.tenants.all,
        queryFn: () => fetchTenantDetail(id!),
        enabled: Boolean(id)
    });

    const invalidateTenantData = () => {
        queryClient.invalidateQueries({ queryKey: id ? queryKeys.tenants.detail(id) : queryKeys.tenants.all });
        // tenants.all is the common prefix: refreshes dashboards, approvals and requests too.
        queryClient.invalidateQueries({ queryKey: queryKeys.tenants.all });
        queryClient.invalidateQueries({ queryKey: queryKeys.bikes.all });
    };

    useEffect(() => {
        if (tenant && !editForm) {
            setEditForm({ ...tenant, bike_id: tenant.bikes?.id || '', weekly_payment: tenant.weekly_payment ?? '', battery_config: tenant.battery_config || '' });
            setBatteryAssignments(parseBatteryConfig(tenant.battery_config));
        }
    }, [tenant, editForm]);

    if (loading) return <LoadingState label="Загрузка арендатора…" />;
    if (tenantError || bikesError) return <ErrorState message={`Не удалось загрузить арендатора. ${tenantQueryError?.message || 'Проверьте подключение к базе данных.'}`} retry={() => { void queryClient.invalidateQueries({ queryKey: id ? queryKeys.tenants.detail(id) : queryKeys.tenants.all }); }} />;
    if (!tenant || !editForm) return <EmptyState title="Арендатор не найден" />;

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
        const paymentDay = normalizePaymentDay(editForm.payment_day);
        const currentPaymentDay = Number(tenant.payment_day) || getPaymentDay(tenant.next_payment_date || new Date());
        const weeklyPayment = Number(editForm.weekly_payment) || 0;
        const nextPaymentDate = !editForm.bike_id
            ? null
            : paymentDay === currentPaymentDay && tenant.next_payment_date
                ? tenant.next_payment_date
                : getScheduledPaymentDate(tenant.next_payment_date || new Date(), paymentDay);
        try {
            await updateTenantProfile(id!, { ...editForm, battery_config: serializeBatteryConfig(batteryAssignments), payment_day: paymentDay, next_payment_date: nextPaymentDate, weekly_payment: weeklyPayment });
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
            navigate('/');
        } catch (error) {
            toast.error(getErrorMessage(error));
        }
    };

    const confirmDeleteTenant = async () => {
        try {
            await deleteTenant(id!);
            queryClient.invalidateQueries({ queryKey: queryKeys.tenants.all });
            navigate('/');
        } catch (error) {
            toast.error(getErrorMessage(error));
        }
    };

    const handleApproveCharge = async (chargeId: string) => {
        try {
            await approveTenantPaymentCharge(chargeId);
            toast.success('Начисление утверждено');
            invalidateTenantData();
        } catch (error) {
            toast.error(getErrorMessage(error));
        }
    };

    const paymentLedger = buildPaymentLedger(tenant, tenant.payments);

    const copyTelegramMessage = async () => {
        try {
            await navigator.clipboard.writeText(getTelegramMessage(paymentLedger.balanceAtReference));
            toast.success('Сообщение скопировано');
        } catch (error) {
            toast.error(getErrorMessage(error));
        }
    };

    const updateBatteryAssignments = (next: BatteryAssignment[]) => {
        const normalized = next.slice(0, 2);
        setBatteryAssignments(normalized);
        setEditForm(current => current ? { ...current, battery_config: serializeBatteryConfig(normalized) } : current);
    };

    const addCustomBattery = async (index: number) => {
        setCustomBatterySaving(true);
        try {
            const battery = await saveBattery(customBatteryCode);
            const next = batteryAssignments.slice();
            next[index] = { ...(next[index] || { capacity: '13' }), battery_id: battery.id, code: battery.code };
            updateBatteryAssignments(next);
            await queryClient.invalidateQueries({ queryKey: queryKeys.batteries.all });
            setCustomBatteryCode('');
            setCustomBatteryIndex(null);
            toast.success(`Батарея ${battery.code} добавлена в инвентарь`);
        } catch (error) {
            toast.error(getErrorMessage(error));
        } finally {
            setCustomBatterySaving(false);
        }
    };

    const sortedBikes = [...bikes].sort((a, b) => {
            const statusOrder: Record<string, number> = { available: 0, maintenance: 1, in_rent: 2 };
            return (statusOrder[a.status || ''] ?? 3) - (statusOrder[b.status || ''] ?? 3);
        });

    return (
        <div className="max-w-5xl mx-auto font-sans px-2 sm:px-6 py-4 sm:py-6 pb-24">
            <div className="mb-6">
                <Link to="/" className="text-sm font-medium text-lime-800 hover:text-lime-700 dark:text-lime-400 dark:hover:text-lime-300 flex items-center">
                    <ArrowLeft className="w-4 h-4 mr-1" /> Вернуться к списку
                </Link>
            </div>

            <div className="bg-white dark:bg-slate-900 rounded-lg shadow-sm border border-slate-200 dark:border-slate-800 overflow-hidden p-4 sm:p-6 relative">
                {!isEditing ? (
                    <>
                        <div className="absolute right-4 top-4 flex items-center gap-2 sm:right-6 sm:top-6">
                            <button aria-label="Редактировать арендатора" onClick={() => { setEditForm({ ...tenant, bike_id: tenant.bikes?.id || '', weekly_payment: tenant.weekly_payment ?? '', battery_config: tenant.battery_config || '' }); setBatteryAssignments(parseBatteryConfig(tenant.battery_config)); setIsEditing(true); }} className="rounded-lg bg-slate-200/50 p-2 text-slate-500 transition-colors hover:text-slate-900 dark:bg-slate-700/50 dark:text-slate-400 dark:hover:text-white">
                                <Edit2 className="w-5 h-5" />
                            </button>
                        </div>
                        <h1 className="text-2xl font-bold text-slate-900 dark:text-white pr-10 flex items-center gap-3">
                            {tenant.name}
                            {tenant.is_archived && <span className="bg-slate-200 dark:bg-slate-700 text-slate-600 dark:text-slate-300 px-2.5 py-1 rounded text-xs uppercase font-bold tracking-wider">Архив</span>}
                        </h1>
                        <p className="text-lime-800 dark:text-lime-400 font-medium mt-1">/{tenant.slug} — <span className="text-slate-500 dark:text-slate-400">{tenant.bikes?.model || 'Нет велосипеда'}</span></p>
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
                                    <a href={`https://t.me/${normalizeTelegramUsername(tenant.telegram_username)}?text=${encodeURIComponent(getTelegramMessage(paymentLedger.balanceAtReference))}`} target="_blank" rel="noreferrer" className="inline-flex items-center gap-2 font-semibold text-lime-800 hover:text-lime-700 dark:text-lime-400 dark:hover:text-lime-300">
                                        <Send className="h-4 w-4" /> Написать @{normalizeTelegramUsername(tenant.telegram_username)}
                                    </a>
                                ) : <button type="button" onClick={copyTelegramMessage} className="inline-flex items-center gap-2 font-semibold text-lime-800 hover:text-lime-700 dark:text-lime-400 dark:hover:text-lime-300">
                                    <Send className="h-4 w-4" /> Скопировать сообщение
                                </button>}
                            </div>
                            <div className="sm:col-span-2 rounded-lg border border-slate-200 bg-slate-100 p-4 dark:border-slate-800 dark:bg-slate-700/50">
                                <span className="block text-slate-500 dark:text-slate-400 mb-1 text-xs uppercase tracking-wider">Заметка администратора</span>
                                <span className="text-slate-600 dark:text-slate-300 whitespace-pre-line">{tenant.admin_comment || 'Нет комментария'}</span>
                            </div>
                        </div>
                    </>
                ) : (
                    <form onSubmit={handleUpdateTenant} className="space-y-4">
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                            <div>
                                <label htmlFor="tenant-name" className="block text-sm font-medium text-slate-600 dark:text-slate-300">Имя</label>
                                <input id="tenant-name" type="text" value={editForm.name} onChange={e => setEditForm({ ...editForm, name: e.target.value })} className="mt-1 block w-full rounded-md border border-slate-300 bg-white text-slate-900 dark:border-slate-700 dark:bg-slate-950 dark:text-white py-2 px-3 focus:border-lime-500 focus:ring-1 focus:ring-lime-500 sm:text-sm" />
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-slate-600 dark:text-slate-300">Велосипед</label>
                                <TenantBikeSelector
                                    bikes={sortedBikes}
                                    selectedBikeId={editForm.bike_id}
                                    onChange={(bikeId) => setEditForm({ ...editForm, bike_id: bikeId })}
                                />
                            </div>
                            <div>
                                <label htmlFor="tenant-slug" className="block text-sm font-medium text-slate-600 dark:text-slate-300">Псевдоним ссылки</label>
                                <div className="mt-1 flex rounded-md shadow-sm">
                                    <span className="inline-flex items-center rounded-l-md border border-r-0 border-slate-300 bg-slate-100 px-3 text-slate-500 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-400 sm:text-sm">/</span>
                                    <input id="tenant-slug" type="text" value={editForm.slug} onChange={e => setEditForm({ ...editForm, slug: e.target.value })} className="block w-full min-w-0 flex-1 rounded-none rounded-r-md border border-slate-300 bg-white text-slate-900 dark:border-slate-700 dark:bg-slate-950 dark:text-white py-2 px-3 focus:outline-none focus:border-lime-500 focus:ring-1 focus:ring-lime-500 sm:text-sm" />
                                </div>
                            </div>
                            <div>
                                <label htmlFor="tenant-deposit" className="block text-sm font-medium text-slate-600 dark:text-slate-300">Депозит (zł)</label>
                                <input id="tenant-deposit" type="number" value={editForm.deposit || ''} onChange={e => setEditForm({ ...editForm, deposit: e.target.value })} className="mt-1 block w-full rounded-md border border-slate-300 bg-white text-slate-900 dark:border-slate-700 dark:bg-slate-950 dark:text-white py-2 px-3 focus:outline-none focus:border-lime-500 focus:ring-1 focus:ring-lime-500 sm:text-sm" />
                            </div>
                            <div>
                                <label htmlFor="tenant-phone" className="block text-sm font-medium text-slate-600 dark:text-slate-300">Телефон</label>
                                <input id="tenant-phone" type="tel" value={editForm.phone || ''} onChange={e => setEditForm({ ...editForm, phone: e.target.value })} placeholder="+48 123 456 789" className="mt-1 block w-full rounded-md border border-slate-300 bg-white text-slate-900 dark:border-slate-700 dark:bg-slate-950 dark:text-white py-2 px-3 focus:outline-none focus:border-lime-500 focus:ring-1 focus:ring-lime-500 sm:text-sm" />
                            </div>
                            <div>
                                <label htmlFor="tenant-telegram" className="block text-sm font-medium text-slate-600 dark:text-slate-300">Telegram</label>
                                <input id="tenant-telegram" type="text" value={editForm.telegram_username || ''} onChange={e => setEditForm({ ...editForm, telegram_username: e.target.value })} placeholder="username или @username" className="mt-1 block w-full rounded-md border border-slate-300 bg-white text-slate-900 dark:border-slate-700 dark:bg-slate-950 dark:text-white py-2 px-3 focus:outline-none focus:border-lime-500 focus:ring-1 focus:ring-lime-500 sm:text-sm" />
                            </div>
                            <div>
                                <label htmlFor="tenant-weekly" className="block text-sm font-medium text-slate-600 dark:text-slate-300">Еженедельный платеж (zł)</label>
                                <input id="tenant-weekly" type="number" min="0" value={editForm.weekly_payment || ''} onChange={e => setEditForm({ ...editForm, weekly_payment: e.target.value })} className="mt-1 block w-full rounded-md border border-slate-300 bg-white text-slate-900 dark:border-slate-700 dark:bg-slate-950 dark:text-white py-2 px-3 focus:border-lime-500 focus:ring-1 focus:ring-lime-500 sm:text-sm" />
                            </div>
                            <div className="sm:col-span-2">
                                <label className="block text-sm font-medium text-slate-600 dark:text-slate-300">Батареи</label>
                                <div className="mt-1 grid gap-3 sm:grid-cols-2">
                                    {[0, 1].map(index => {
                                        const assignment = batteryAssignments[index];
                                        const selectedCapacity = assignment?.capacity || '';
                                        const availableBatteries = batteries.filter(battery => battery.status === 'available' || battery.id === assignment?.battery_id);
                                        return <div key={index} className="rounded-lg border border-slate-400 bg-slate-200 p-3 dark:border-slate-600 dark:bg-slate-700">
                                            <div className="mb-2 text-xs font-bold uppercase tracking-wide text-slate-500 dark:text-slate-300">Батарея {index + 1}</div>
                                            <select value={selectedCapacity} onChange={event => { const next = batteryAssignments.slice(); if (event.target.value) next[index] = { capacity: event.target.value, battery_id: null, code: null }; else next.splice(index, 1); updateBatteryAssignments(next); }} className="block w-full rounded-md border border-slate-400 bg-white px-3 py-2 text-sm text-slate-900 dark:border-slate-600 dark:bg-slate-800 dark:text-white">
                                                <option value="">Не используется</option>{BATTERY_CAPACITY_OPTIONS.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}
                                            </select>
                                            <select value={customBatteryIndex === index ? '__custom__' : assignment?.battery_id || ''} disabled={!assignment?.capacity} onChange={event => { if (event.target.value === '__custom__') { setCustomBatteryIndex(index); setCustomBatteryCode(''); return; } const battery = batteries.find(item => item.id === event.target.value); const next = batteryAssignments.slice(); next[index] = { ...assignment!, battery_id: battery?.id || null, code: battery?.code || null }; updateBatteryAssignments(next); }} className="mt-2 block w-full rounded-md border border-slate-400 bg-white px-3 py-2 text-sm text-slate-900 disabled:cursor-not-allowed disabled:opacity-60 dark:border-slate-600 dark:bg-slate-800 dark:text-white">
                                                <option value="">Серийный код не выбран</option>{availableBatteries.map(battery => <option key={battery.id} value={battery.id}>{battery.code}</option>)}<option value="__custom__">＋ Ввести новый код</option>
                                            </select>
                                            {customBatteryIndex === index && <div className="mt-2 flex gap-2"><input autoFocus value={customBatteryCode} onChange={event => setCustomBatteryCode(event.target.value.replace(/\D/g, '').slice(0, 3))} inputMode="numeric" maxLength={3} placeholder="007" className="min-w-0 flex-1 rounded-md border border-slate-400 bg-white px-3 py-2 text-sm text-slate-900 dark:border-slate-600 dark:bg-slate-800 dark:text-white" /><button type="button" disabled={customBatterySaving || customBatteryCode.length !== 3} onClick={() => addCustomBattery(index)} className="rounded-md bg-lime-500 px-3 text-xs font-bold text-slate-950 disabled:opacity-50">{customBatterySaving ? '…' : 'Добавить'}</button></div>}
                                        </div>;
                                    })}
                                </div>
                                <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">Сначала выберите ёмкость. Серийный код можно добавить позже, когда батареи будут внесены в инвентарь.</p>
                                {batteryAssignments.length > 0 && <div className="mt-2 flex items-center justify-between gap-2 text-xs"><span className="text-slate-500 dark:text-slate-400">Рекомендованная цена: <strong className="text-lime-800 dark:text-lime-300">{getRecommendedWeeklyPrice(sortedBikes.find(bike => bike.id === editForm.bike_id)?.type || editForm.bikes?.type, serializeBatteryConfig(batteryAssignments)) ?? '—'} zł/нед.</strong></span><button type="button" onClick={() => { const recommended = getRecommendedWeeklyPrice(sortedBikes.find(bike => bike.id === editForm.bike_id)?.type || editForm.bikes?.type, serializeBatteryConfig(batteryAssignments)); if (recommended != null) setEditForm({ ...editForm, weekly_payment: recommended }); }} className="font-semibold text-lime-800 hover:text-lime-700 dark:text-lime-300">Применить</button></div>}
                            </div>
                            <div>
                                <label htmlFor="tenant-payment-day" className="block text-sm font-medium text-slate-600 dark:text-slate-300">День еженедельного платежа</label>
                                <select id="tenant-payment-day" value={editForm.payment_day || DEFAULT_PAYMENT_DAY} onChange={e => setEditForm({ ...editForm, payment_day: Number(e.target.value) })} className="mt-1 block w-full rounded-md border border-slate-300 bg-white text-slate-900 dark:border-slate-700 dark:bg-slate-950 dark:text-white py-2 px-3 focus:border-lime-500 focus:ring-1 focus:ring-lime-500 sm:text-sm">
                                    {PAYMENT_DAYS.map(day => <option key={day.value} value={day.value}>{day.label}</option>)}
                                </select>
                            </div>
                            <div className="sm:col-span-2">
                                <label htmlFor="tenant-comment" className="block text-sm font-medium text-slate-600 dark:text-slate-300">Комментарий (видно арендатору)</label>
                                <textarea id="tenant-comment" value={editForm.admin_comment || ''} onChange={e => setEditForm({ ...editForm, admin_comment: e.target.value })} className="mt-1 block w-full rounded-md border border-slate-300 bg-white text-slate-900 dark:border-slate-700 dark:bg-slate-950 dark:text-white py-2 px-3 focus:border-lime-500 focus:ring-1 focus:ring-lime-500 sm:text-sm" rows={3} />
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
                            <button type="button" onClick={() => { setEditForm({ ...tenant, bike_id: tenant.bikes?.id || '', weekly_payment: tenant.weekly_payment ?? '', battery_config: tenant.battery_config || '' }); setBatteryAssignments(parseBatteryConfig(tenant.battery_config)); setIsEditing(false); }} className="rounded-md border border-slate-300 bg-white py-2 px-4 shadow-sm text-sm font-medium text-slate-600 hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300 dark:hover:bg-slate-800 transition-colors">Отмена</button>
                            <button type="submit" className="rounded-md border border-transparent bg-lime-600 py-2 px-4 shadow-sm text-sm font-semibold text-slate-950 hover:bg-lime-500 transition-colors">Сохранить</button>
                        </div>
                    </form>
                )}
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mt-6">
                <TenantBalanceSection
                    ledger={paymentLedger}
                    onAddEntry={() => { setEditingLedgerEntry({ type: 'payment', value: null }); setIsLedgerModalOpen(true); }}
                    canFinishRental={Boolean(tenant.bike_id)}
                    onFinishRental={() => setRentalEndEvent(null)}
                    onEditRentalEnd={(event) => setRentalEndEvent(event)}
                    onApproveCharge={handleApproveCharge}
                    onEditEntry={(entry) => {
                        if (entry.type === 'payment') {
                            setEditingLedgerEntry({ type: 'payment', value: { id: entry.paymentId, amount: entry.amount, payment_date: entry.dateKey, comment: entry.comment } });
                            setIsLedgerModalOpen(true);
                            return;
                        }
                        if (entry.type === 'adjustment') {
                            setEditingLedgerEntry({ type: 'adjustment', value: { id: entry.adjustmentId, amount: entry.amount, balance_override: entry.balanceOverride, adjustment_date: entry.dateKey, comment: entry.comment, direction: entry.signedAmount >= 0 ? 'charge' : 'credit' } });
                            setIsLedgerModalOpen(true);
                            return;
                        }
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

            {rentalEndEvent !== undefined && <RentalEndModal tenant={tenant} event={rentalEndEvent} onClose={() => setRentalEndEvent(undefined)} onSuccess={() => { setRentalEndEvent(undefined); setEditForm(null); invalidateTenantData(); }} />}

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
