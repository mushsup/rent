/* eslint-disable react/prop-types */
import { useParams, Link, useNavigate } from 'react-router-dom';
import { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';
import { calculateDebt, getTenantWeeklyPayment } from '../../utils/calculateDebt';
import { buildPaymentLedger } from '../../utils/paymentLedger';
import { format } from 'date-fns';
import { DEFAULT_PAYMENT_DAY, PAYMENT_DAYS, getNextPaymentDate, getPaymentDay, getPaymentDayAbbreviation } from '../../utils/paymentSchedule';
import { ru } from 'date-fns/locale';
import { ArrowLeft, Edit2, Trash2, Calendar, DollarSign, AlertCircle, X, Archive, ChevronDown, CheckCircle, Pencil, Phone, Send } from 'lucide-react';
import { useQuery, useQueryClient } from '@tanstack/react-query';

function normalizeTelegramUsername(value) {
    return (value || '')
        .trim()
        .replace(/^https?:\/\/t\.me\//i, '')
        .replace(/^@/, '');
}

function getPhoneHref(phone) {
    return `tel:${(phone || '').replace(/[^\d+]/g, '')}`;
}

export default function AdminTenantDetail() {
    const { id } = useParams();
    const queryClient = useQueryClient();
    const navigate = useNavigate();

    const [isEditing, setIsEditing] = useState(false);
    const [isPaymentModalOpen, setIsPaymentModalOpen] = useState(false);
    const [editingPayment, setEditingPayment] = useState(null);
    const [isAdjustmentModalOpen, setIsAdjustmentModalOpen] = useState(false);
    const [editingAdjustment, setEditingAdjustment] = useState(null);
    const [isArchiveModalOpen, setIsArchiveModalOpen] = useState(false);
    const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
    const [deletingRecord, setDeletingRecord] = useState(null);
    const [editForm, setEditForm] = useState(null);

    const { data: bikes = [], isError: bikesError } = useQuery({
        queryKey: ['bikes'],
        queryFn: async () => {
            const { data } = await supabase.from('bikes').select('id, model, type, status');
            return data || [];
        }
    });

    const { data: tenant, isLoading: loading, isError: tenantError, error: tenantQueryError } = useQuery({
        queryKey: ['tenant', id],
        queryFn: async () => {
            await supabase.rpc('ensure_tenant_payment_charges', { p_tenant_id: id });
            const { data } = await supabase
                .from('tenants')
                .select('id, name, slug, bike_id, is_archived, phone, telegram_username, next_payment_date, next_payment_amount, next_payment_comment, weekly_payment, payment_day, deposit, admin_comment, payments(id, amount, payment_date, comment, created_at), payment_terms:tenant_payment_terms(id, weekly_payment, payment_day, effective_from, effective_to), payment_charges:tenant_payment_charges(id, due_date, amount, comment, status), payment_adjustments:tenant_payment_adjustments(id, direction, amount, adjustment_date, comment), bikes(id, model, type, status)')
                .eq('id', id)
                .single();

            if (data) {
                data.payments.sort((a, b) => new Date(b.payment_date) - new Date(a.payment_date));
            }
            return data;
        },
        onSuccess: (data) => {
            if (data && !editForm) {
                setEditForm({ ...data, bike_id: data.bikes?.id || '', weekly_payment: data.weekly_payment ?? data.bikes?.price ?? '' });
            }
        }
    });

    useEffect(() => {
        if (tenant && !editForm) {
            setEditForm({ ...tenant, bike_id: tenant.bikes?.id || '', weekly_payment: tenant.weekly_payment ?? tenant.bikes?.price ?? '' });
        }
    }, [tenant, editForm]);

    const confirmDeleteRecord = async () => {
        if (!deletingRecord) return;

        const table = deletingRecord.type === 'adjustment'
            ? 'tenant_payment_adjustments'
            : 'payments';
        const { error } = await supabase.from(table).delete().eq('id', deletingRecord.id);

        if (error) {
            alert(error.message);
            return;
        }

        setDeletingRecord(null);
        queryClient.invalidateQueries({ queryKey: ['tenant', id] });
        queryClient.invalidateQueries({ queryKey: ['tenants'] });
    };

    const handleUpdateTenant = async (e) => {
        e.preventDefault();
        const paymentDay = Number(editForm.payment_day) || DEFAULT_PAYMENT_DAY;
        const currentPaymentDay = Number(tenant.payment_day) || getPaymentDay(tenant.next_payment_date || new Date());
        const weeklyPayment = Number(editForm.weekly_payment) || 0;
        const nextPaymentDate = paymentDay === currentPaymentDay
            ? tenant.next_payment_date || null
            : getNextPaymentDate(tenant.next_payment_date || new Date(), paymentDay);
        const { error: profileError } = await supabase.rpc('update_tenant_profile', {
            p_tenant_id: id,
            p_name: editForm.name,
            p_slug: editForm.slug.toLowerCase().trim().replace(/[^a-z0-9-]/g, '-'),
            p_bike_id: editForm.bike_id || null,
            p_weekly_payment: weeklyPayment,
            p_payment_day: paymentDay,
            p_next_payment_date: nextPaymentDate,
            p_deposit: Number(editForm.deposit) || 0,
            p_admin_comment: editForm.admin_comment || null
        });

        const { error: contactError } = profileError
            ? { error: null }
            : await supabase.from('tenants').update({
                phone: editForm.phone?.trim() || null,
                telegram_username: normalizeTelegramUsername(editForm.telegram_username) || null
            }).eq('id', id);
        const error = profileError || contactError;

        if (!error) {
            setIsEditing(false);
            queryClient.invalidateQueries({ queryKey: ['tenant', id] });
            queryClient.invalidateQueries({ queryKey: ['tenants'] });
            queryClient.invalidateQueries({ queryKey: ['bikes'] });
        } else {
            alert(error.message);
        }
    };

    const confirmToggleArchive = async () => {
        const newArchivedState = !tenant.is_archived;
        const { error } = await supabase.from('tenants').update({ is_archived: newArchivedState }).eq('id', id);
        if (!error) {
            if (newArchivedState && tenant.bikes?.id) {
                await supabase.from('bikes').update({ status: 'available' }).eq('id', tenant.bikes.id);
            }
            navigate('/admin');
        } else {
            alert(error.message);
        }
    };

    const confirmDeleteTenant = async () => {
        // Delete payments first to prevent foreign key constraint issues if CASCADE is not set
        const { error } = await supabase.from('payments').delete().eq('tenant_id', id);

        if (!error) {
            queryClient.invalidateQueries({ queryKey: ['tenants'] });
            navigate('/admin');
        } else {
            alert(error.message);
        }
    };

    if (loading) return <div className="text-gray-600 dark:text-gray-300 p-8">Загрузка...</div>;
    if (tenantError || bikesError) return <div className="text-red-400 p-8">Не удалось загрузить арендатора. {tenantQueryError?.message || 'Проверьте подключение к базе данных.'}</div>;
    if (!tenant || !editForm) return <div className="text-red-400 p-8">Арендатор не найден</div>;

    const { nextPaymentDate, isOverdue, expectedAmount } = calculateDebt(tenant, tenant.payments);
    const paymentLedger = buildPaymentLedger(tenant, tenant.payments);

    const sortedBikes = bikes
        .filter(b => b.status === 'available' || b.status === 'maintenance' || b.id === tenant.bikes?.id)
        .sort((a, b) => {
            const statusOrder = { available: 0, maintenance: 1, in_rent: 2 };
            return (statusOrder[a.status] ?? 3) - (statusOrder[b.status] ?? 3);
        });

    return (
        <div className="max-w-5xl mx-auto font-sans px-2 sm:px-6 py-4 sm:py-6 pb-24">
            <div className="mb-6">
                <Link to="/admin" className="text-sm font-medium text-indigo-400 hover:text-indigo-300 flex items-center">
                    <ArrowLeft className="w-4 h-4 mr-1" /> Вернуться к списку
                </Link>
            </div>

            <div className="bg-white dark:bg-gray-800 rounded-xl shadow-lg border border-gray-200 dark:border-gray-700 overflow-hidden p-4 sm:p-6 relative">
                {!isEditing ? (
                    <>
                        <button onClick={() => setIsEditing(true)} className="absolute top-6 right-6 text-gray-500 dark:text-gray-400 hover:text-gray-900 dark:text-white transition-colors bg-gray-200/50 dark:bg-gray-700/50 p-2 rounded-lg">
                            <Edit2 className="w-5 h-5" />
                        </button>
                        <h1 className="text-2xl font-bold text-gray-900 dark:text-white pr-10 flex items-center gap-3">
                            {tenant.name}
                            {tenant.is_archived && <span className="bg-gray-200 dark:bg-gray-700 text-gray-600 dark:text-gray-300 px-2.5 py-1 rounded text-xs uppercase font-bold tracking-wider">Архив</span>}
                        </h1>
                        <p className="text-indigo-400 font-medium mt-1">/{tenant.slug} — <span className="text-gray-500 dark:text-gray-400">{tenant.bikes?.model || 'Нет велосипеда'}</span></p>

                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm mt-6 border-t border-gray-200 dark:border-gray-700 pt-6">
                            <div className="bg-gray-100 dark:bg-gray-700/50 p-3 rounded-lg border border-gray-200 dark:border-gray-700">
                                <span className="block text-gray-400 dark:text-gray-500 mb-1">Ставка в неделю:</span>
                                <span className="font-semibold text-gray-900 dark:text-white text-lg">{getTenantWeeklyPayment(tenant)}&nbsp;zł</span>
                            </div>
                            <div className="bg-gray-100 dark:bg-gray-700/50 p-3 rounded-lg border border-gray-200 dark:border-gray-700">
                                <span className="block text-gray-400 dark:text-gray-500 mb-1">Депозит:</span>
                                <span className="font-semibold text-gray-900 dark:text-white text-lg">{tenant.deposit || 0}&nbsp;zł</span>
                            </div>
                            <div className="bg-gray-100 dark:bg-gray-700/50 p-3 rounded-lg border border-gray-200 dark:border-gray-700">
                                <span className="block text-gray-400 dark:text-gray-500 mb-2">Телефон:</span>
                                {tenant.phone ? (
                                    <a href={getPhoneHref(tenant.phone)} className="inline-flex items-center gap-2 font-semibold text-indigo-500 hover:text-indigo-400">
                                        <Phone className="h-4 w-4" /> {tenant.phone}
                                    </a>
                                ) : <span className="text-gray-500 dark:text-gray-400">Не указан</span>}
                            </div>
                            <div className="bg-gray-100 dark:bg-gray-700/50 p-3 rounded-lg border border-gray-200 dark:border-gray-700">
                                <span className="block text-gray-400 dark:text-gray-500 mb-2">Telegram:</span>
                                {tenant.telegram_username ? (
                                    <a href={`https://t.me/${normalizeTelegramUsername(tenant.telegram_username)}`} target="_blank" rel="noreferrer" className="inline-flex items-center gap-2 font-semibold text-indigo-500 hover:text-indigo-400">
                                        <Send className="h-4 w-4" /> @{normalizeTelegramUsername(tenant.telegram_username)}
                                    </a>
                                ) : <span className="text-gray-500 dark:text-gray-400">Не указан</span>}
                            </div>
                            <div className="sm:col-span-2 bg-blue-900/10 border border-blue-900/30 p-4 rounded-lg">
                                <span className="block text-gray-500 dark:text-gray-400 mb-1 text-xs uppercase tracking-wider">Заметка администратора</span>
                                <span className="text-gray-600 dark:text-gray-300 whitespace-pre-line">{tenant.admin_comment || 'Нет комментария'}</span>
                            </div>
                        </div>
                    </>
                ) : (
                    <form onSubmit={handleUpdateTenant} className="space-y-4">
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                            <div>
                                <label className="block text-sm font-medium text-gray-600 dark:text-gray-300">Имя</label>
                                <input type="text" value={editForm.name} onChange={e => setEditForm({ ...editForm, name: e.target.value })} className="mt-1 block w-full rounded-md bg-gray-200 dark:bg-gray-700 border border-gray-400 dark:border-gray-600 text-gray-900 dark:text-white py-2 px-3 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 sm:text-sm" />
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-gray-600 dark:text-gray-300">Велосипед</label>
                                <BikeSelector
                                    bikes={sortedBikes}
                                    selectedBikeId={editForm.bike_id}
                                    onChange={(bikeId) => setEditForm({ ...editForm, bike_id: bikeId })}
                                />
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-gray-600 dark:text-gray-300">Псевдоним ссылки</label>
                                <div className="mt-1 flex rounded-md shadow-sm">
                                    <span className="inline-flex items-center rounded-l-md border border-r-0 border-gray-400 dark:border-gray-600 bg-gray-200 dark:bg-gray-700 px-3 text-gray-500 dark:text-gray-400 sm:text-sm">/</span>
                                    <input type="text" value={editForm.slug} onChange={e => setEditForm({ ...editForm, slug: e.target.value })} className="block w-full min-w-0 flex-1 rounded-none rounded-r-md bg-gray-200 dark:bg-gray-700 border border-gray-400 dark:border-gray-600 text-gray-900 dark:text-white py-2 px-3 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 sm:text-sm" />
                                </div>
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-gray-600 dark:text-gray-300">Депозит (zł)</label>
                                <input type="number" value={editForm.deposit || ''} onChange={e => setEditForm({ ...editForm, deposit: e.target.value })} className="mt-1 block w-full rounded-md bg-gray-200 dark:bg-gray-700 border border-gray-400 dark:border-gray-600 text-gray-900 dark:text-white py-2 px-3 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 sm:text-sm" />
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-gray-600 dark:text-gray-300">Телефон</label>
                                <input type="tel" value={editForm.phone || ''} onChange={e => setEditForm({ ...editForm, phone: e.target.value })} placeholder="+48 123 456 789" className="mt-1 block w-full rounded-md bg-gray-200 dark:bg-gray-700 border border-gray-400 dark:border-gray-600 text-gray-900 dark:text-white py-2 px-3 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 sm:text-sm" />
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-gray-600 dark:text-gray-300">Telegram</label>
                                <input type="text" value={editForm.telegram_username || ''} onChange={e => setEditForm({ ...editForm, telegram_username: e.target.value })} placeholder="username или @username" className="mt-1 block w-full rounded-md bg-gray-200 dark:bg-gray-700 border border-gray-400 dark:border-gray-600 text-gray-900 dark:text-white py-2 px-3 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 sm:text-sm" />
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-gray-600 dark:text-gray-300">Еженедельный платеж (zł)</label>
                                <input type="number" min="0" value={editForm.weekly_payment || ''} onChange={e => setEditForm({ ...editForm, weekly_payment: e.target.value })} className="mt-1 block w-full rounded-md bg-gray-200 dark:bg-gray-700 border border-gray-400 dark:border-gray-600 text-gray-900 dark:text-white py-2 px-3 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 sm:text-sm" />
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-gray-600 dark:text-gray-300">День еженедельного платежа</label>
                                <select value={editForm.payment_day || DEFAULT_PAYMENT_DAY} onChange={e => setEditForm({ ...editForm, payment_day: Number(e.target.value) })} className="mt-1 block w-full rounded-md bg-gray-200 dark:bg-gray-700 border border-gray-400 dark:border-gray-600 text-gray-900 dark:text-white py-2 px-3 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 sm:text-sm">
                                    {PAYMENT_DAYS.map(day => <option key={day.value} value={day.value}>{day.label}</option>)}
                                </select>
                            </div>
                            <div className="sm:col-span-2">
                                <label className="block text-sm font-medium text-gray-600 dark:text-gray-300">Комментарий (видно арендатору)</label>
                                <textarea value={editForm.admin_comment || ''} onChange={e => setEditForm({ ...editForm, admin_comment: e.target.value })} className="mt-1 block w-full rounded-md bg-gray-200 dark:bg-gray-700 border border-gray-400 dark:border-gray-600 text-gray-900 dark:text-white py-2 px-3 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 sm:text-sm" rows="3" />
                            </div>
                        </div>

                        <div className="mt-8 pt-6 border-t border-gray-700/50">
                            <h3 className="text-sm font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-4">Опасная зона</h3>
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
                        <div className="flex justify-end space-x-3 mt-4 pt-4 border-t border-gray-200 dark:border-gray-700">
                            <button type="button" onClick={() => setIsEditing(false)} className="rounded-md border border-gray-400 dark:border-gray-600 bg-gray-200 dark:bg-gray-700 py-2 px-4 shadow-sm text-sm font-medium text-gray-600 dark:text-gray-300 hover:bg-gray-600 transition-colors">Отмена</button>
                            <button type="submit" className="rounded-md border border-transparent bg-indigo-600 py-2 px-4 shadow-sm text-sm font-medium text-gray-900 dark:text-white hover:bg-indigo-500 transition-colors">Сохранить</button>
                        </div>
                    </form>
                )}
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mt-6">
                <div className="md:col-span-2 bg-white dark:bg-gray-800 rounded-xl shadow border border-gray-200 dark:border-gray-700 p-4 sm:p-6">
                    <div className="flex items-center justify-between mb-4">
                        <h3 className="text-lg font-medium text-gray-900 dark:text-white flex items-center">
                            <Calendar className="w-5 h-5 mr-2 text-indigo-400" /> Платежи
                        </h3>
                        <div className="flex gap-2 relative">
                            <button title="Добавить корректировку" onClick={() => { setEditingAdjustment(null); setIsAdjustmentModalOpen(true); }} className="flex items-center bg-gray-200/50 dark:bg-gray-700/50 hover:bg-gray-200 dark:hover:bg-gray-700 border border-gray-400 dark:border-gray-600 text-gray-600 dark:text-gray-300 hover:text-gray-900 dark:text-white p-2 rounded-md transition-colors">
                                <Pencil className="w-4 h-4" />
                            </button>
                            <button title="Добавить платеж" onClick={() => { setEditingPayment(null); setIsPaymentModalOpen(true); }} className="flex items-center bg-gray-200/50 dark:bg-gray-700/50 hover:bg-gray-200 dark:hover:bg-gray-700 border border-gray-400 dark:border-gray-600 text-gray-600 dark:text-gray-300 hover:text-gray-900 dark:text-white p-2 rounded-md transition-colors">
                                <CheckCircle className="w-4 h-4" />
                            </button>
                        </div>
                    </div>
                    <PaymentLedgerList
                        entries={paymentLedger.entries}
                        payments={tenant.payments}
                        onEditPayment={(payment) => { setEditingPayment(payment); setIsPaymentModalOpen(true); }}
                        onEditExpected={(entry) => { setEditingPayment({ amount: entry.amount, comment: entry.comment || '', payment_date: entry.dateKey, isExpected: true }); setIsPaymentModalOpen(true); }}
                        onDeletePayment={(paymentId) => setDeletingRecord({ type: 'payment', id: paymentId })}
                        onEditAdjustment={(adjustment) => { setEditingAdjustment(adjustment); setIsAdjustmentModalOpen(true); }}
                        onDeleteAdjustment={(adjustmentId) => setDeletingRecord({ type: 'adjustment', id: adjustmentId })}
                    />
                    {typeof window === 'undefined' && <div className="flow-root mt-6">
                        <ul className="-mb-8">
                            {/* Карточка ожидаемого платежа */}
                            {nextPaymentDate && (
                                <li>
                                    <div className="relative pb-8">
                                        {tenant.payments.length > 0 && (
                                            <span className="absolute top-4 left-4 -ml-px h-full w-0.5 bg-gray-200 dark:bg-gray-700" aria-hidden="true" />
                                        )}
                                        <div className="relative flex space-x-3 items-center">
                                            <div>
                                                <span className={`h-8 w-8 rounded-full flex items-center justify-center border ${isOverdue ? 'bg-red-900/50 border-red-700/50' : 'bg-gray-200 dark:bg-gray-700 border-gray-400 dark:border-gray-600'}`}>
                                                    <Calendar className={`h-4 w-4 ${isOverdue ? 'text-red-400' : 'text-gray-500 dark:text-gray-400'}`} aria-hidden="true" />
                                                </span>
                                            </div>
                                            <div className="flex min-w-0 flex-1 justify-between items-center space-x-4 pt-1.5">
                                                <div className="w-1/3">
                                                    <time className={isOverdue ? "text-red-400 font-bold text-sm" : "text-gray-500 dark:text-gray-400 font-medium text-sm"} dateTime={nextPaymentDate.toISOString()}>
                                                        {format(new Date(nextPaymentDate), 'dd MMM yyyy', { locale: ru })}
                                                    </time>
                                                </div>
                                                <div className="w-1/3 text-center">
                                                    <span className={`font-bold px-2 py-0.5 rounded text-sm ${isOverdue ? "text-red-400 bg-red-900/20" : "text-gray-500 dark:text-gray-400 bg-gray-200/50 dark:bg-gray-700/50"}`}>{expectedAmount}&nbsp;zł</span>
                                                </div>
                                                <div className="w-1/3 text-right">
                                                    <button onClick={() => { setEditingPayment({ amount: expectedAmount, payment_date: format(new Date(nextPaymentDate), 'yyyy-MM-dd'), isExpected: true }); setIsPaymentModalOpen(true); }} className="text-gray-500 dark:text-gray-400 hover:text-indigo-400 transition-colors p-1.5 rounded bg-gray-200/50 dark:bg-gray-700/50 hover:bg-gray-200 dark:bg-gray-700 border border-gray-600/50" title="Изменить ожидаемый платеж">
                                                        <Pencil className="w-4 h-4" />
                                                    </button>
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                </li>
                            )}

                            {/* Список фактических платежей */}
                            {tenant.payments.map((payment, paymentIdx) => (
                                <li key={payment.id}>
                                    <div className="relative pb-8">
                                        {paymentIdx !== tenant.payments.length - 1 ? (
                                            <span className="absolute top-4 left-4 -ml-px h-full w-0.5 bg-gray-200 dark:bg-gray-700" aria-hidden="true" />
                                        ) : null}
                                        <div className="relative flex space-x-3 items-center">
                                            <div>
                                                <span className="h-8 w-8 rounded-full bg-indigo-900/50 flex items-center justify-center border border-indigo-700/50">
                                                    <DollarSign className="h-4 w-4 text-indigo-400" aria-hidden="true" />
                                                </span>
                                            </div>
                                            <div className="flex min-w-0 flex-1 justify-between items-center space-x-4 pt-1.5">
                                                <div className="w-1/3">
                                                    <time className="text-gray-600 dark:text-gray-300 font-medium text-sm" dateTime={payment.payment_date}>{format(new Date(payment.payment_date), 'dd MMM yyyy', { locale: ru })}</time>
                                                </div>
                                                <div className="w-1/3 text-center">
                                                    <span className="font-bold text-gray-900 dark:text-white bg-gray-200 dark:bg-gray-700 px-2 py-0.5 rounded text-sm">{payment.amount}&nbsp;zł</span>
                                                </div>
                                                <div className="w-1/3 flex justify-end gap-2">
                                                    <button onClick={() => { setEditingPayment(payment); setIsPaymentModalOpen(true); }} className="text-gray-500 dark:text-gray-400 hover:text-indigo-400 transition-colors p-1.5 rounded bg-gray-200/50 dark:bg-gray-700/50 hover:bg-gray-200 dark:bg-gray-700 border border-gray-600/50">
                                                        <Pencil className="w-4 h-4" />
                                                    </button>
                                                    <button onClick={() => setDeletingRecord({ type: 'payment', id: payment.id })} className="text-red-400 hover:text-gray-900 dark:text-white hover:bg-red-500 transition-colors p-1.5 rounded bg-red-900/20 border border-red-500/20">
                                                        <Trash2 className="w-4 h-4" />
                                                    </button>
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                </li>
                            ))}
                            {tenant.payments.length === 0 && (
                                <div className="text-center py-4 text-gray-400 dark:text-gray-500 text-sm">Оплат пока не было</div>
                            )}
                        </ul>
                    </div>}
                </div>
            </div>

            {/* Delete Confirmation Modal */}
            {deletingRecord && (
                <div className="fixed inset-0 z-50">
                    <div className="fixed inset-0 bg-gray-900/80 backdrop-blur-sm" onClick={(e) => { e.stopPropagation(); setDeletingRecord(null); }} />
                    <div className="fixed inset-0 z-10 flex items-center justify-center p-4 pointer-events-none">
                        <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl max-w-sm w-full p-6 shadow-2xl relative pointer-events-auto">
                            <button onClick={() => setDeletingRecord(null)} className="absolute top-4 right-4 text-gray-500 dark:text-gray-400 hover:text-gray-900 dark:text-white transition-colors bg-gray-200/50 dark:bg-gray-700/50 hover:bg-gray-200 dark:bg-gray-700 p-1 rounded-md">
                                <X className="w-5 h-5" />
                            </button>
                            <div className="flex items-center text-red-400 mb-4 pr-6">
                                <AlertCircle className="w-6 h-6 mr-2" />
                                <h3 className="text-lg font-bold text-gray-900 dark:text-white">Удалить {deletingRecord.type === 'adjustment' ? 'корректировку' : 'платеж'}?</h3>
                            </div>
                            <p className="text-gray-600 dark:text-gray-300 text-sm mb-6">Эта операция удалит запись из истории. Баланс арендатора будет пересчитан. Отменить действие будет невозможно.</p>
                            <div className="flex justify-end space-x-3">
                                <button onClick={() => setDeletingRecord(null)} className="px-4 py-2 bg-gray-200 dark:bg-gray-700 hover:bg-gray-600 text-gray-700 dark:text-gray-200 text-sm font-medium rounded-md transition-colors">Отмена</button>
                                <button onClick={confirmDeleteRecord} className="px-4 py-2 bg-red-600 hover:bg-red-500 text-gray-900 dark:text-white text-sm font-medium rounded-md transition-colors">Удалить</button>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {isPaymentModalOpen && (
                <div className="fixed inset-0 z-50">
                    <div className="fixed inset-0 bg-gray-900/80 backdrop-blur-sm transition-opacity" onClick={(e) => { e.stopPropagation(); setIsPaymentModalOpen(false); }} />
                    <div className="fixed inset-0 z-10 flex items-center justify-center p-4 pointer-events-none">
                        <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl max-w-sm w-full p-6 shadow-2xl relative pointer-events-auto">
                            <PaymentModalForm payment={editingPayment} tenant={tenant} onClose={() => setIsPaymentModalOpen(false)} onSuccess={() => { setIsPaymentModalOpen(false); queryClient.invalidateQueries({ queryKey: ['tenant', id] }); queryClient.invalidateQueries({ queryKey: ['tenants'] }); }} />
                        </div>
                    </div>
                </div>
            )}

            {isAdjustmentModalOpen && (
                <div className="fixed inset-0 z-50">
                    <div className="fixed inset-0 bg-gray-900/80 backdrop-blur-sm transition-opacity" onClick={(e) => { e.stopPropagation(); setIsAdjustmentModalOpen(false); }} />
                    <div className="fixed inset-0 z-10 flex items-center justify-center p-4 pointer-events-none">
                        <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl max-w-sm w-full p-6 shadow-2xl relative pointer-events-auto">
                            <AdjustmentModalForm adjustment={editingAdjustment} tenant={tenant} onClose={() => setIsAdjustmentModalOpen(false)} onSuccess={() => { setIsAdjustmentModalOpen(false); queryClient.invalidateQueries({ queryKey: ['tenant', id] }); queryClient.invalidateQueries({ queryKey: ['tenants'] }); }} />
                        </div>
                    </div>
                </div>
            )}

            {/* Archive Confirmation Modal */}
            {isArchiveModalOpen && (
                <div className="fixed inset-0 z-50">
                    <div className="fixed inset-0 bg-gray-900/80 backdrop-blur-sm" onClick={(e) => { e.stopPropagation(); setIsArchiveModalOpen(false); }} />
                    <div className="fixed inset-0 z-10 flex items-center justify-center p-4 pointer-events-none">
                        <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl max-w-sm w-full p-6 shadow-2xl relative pointer-events-auto">
                            <button onClick={() => setIsArchiveModalOpen(false)} className="absolute top-4 right-4 text-gray-500 dark:text-gray-400 hover:text-gray-900 dark:text-white transition-colors bg-gray-200/50 dark:bg-gray-700/50 hover:bg-gray-200 dark:bg-gray-700 p-1 rounded-md">
                                <X className="w-5 h-5" />
                            </button>
                            <div className="flex items-center text-orange-400 mb-4 pr-6">
                                <Archive className="w-6 h-6 mr-2" />
                                <h3 className="text-lg font-bold text-gray-900 dark:text-white">{tenant.is_archived ? "Вернуть из архива?" : "В архив?"}</h3>
                            </div>
                            <p className="text-gray-600 dark:text-gray-300 text-sm mb-6">
                                {tenant.is_archived
                                    ? "Арендатор снова появится в общем списке активных клиентов."
                                    : "Арендатор будет скрыт из основного списка. Вы сможете найти его, включив фильтр архивных пользователей."}
                            </p>
                            <div className="flex justify-end space-x-3">
                                <button onClick={() => setIsArchiveModalOpen(false)} className="px-4 py-2 bg-gray-200 dark:bg-gray-700 hover:bg-gray-600 text-gray-700 dark:text-gray-200 text-sm font-medium rounded-md transition-colors">Отмена</button>
                                <button onClick={confirmToggleArchive} className="px-4 py-2 bg-orange-600 hover:bg-orange-500 text-gray-900 dark:text-white text-sm font-medium rounded-md transition-colors">
                                    {tenant.is_archived ? "Вернуть" : "В архив"}
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* Delete Tenant Modal */}
            {isDeleteModalOpen && (
                <div className="fixed inset-0 z-50">
                    <div className="fixed inset-0 bg-gray-900/80 backdrop-blur-sm" onClick={(e) => { e.stopPropagation(); setIsDeleteModalOpen(false); }} />
                    <div className="fixed inset-0 z-10 flex items-center justify-center p-4 pointer-events-none">
                        <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl max-w-sm w-full p-6 shadow-2xl relative pointer-events-auto">
                            <button onClick={() => setIsDeleteModalOpen(false)} className="absolute top-4 right-4 text-gray-500 dark:text-gray-400 hover:text-gray-900 dark:text-white transition-colors bg-gray-200/50 dark:bg-gray-700/50 hover:bg-gray-200 dark:bg-gray-700 p-1 rounded-md">
                                <X className="w-5 h-5" />
                            </button>
                            <div className="flex items-center text-red-500 mb-4 pr-6">
                                <AlertCircle className="w-6 h-6 mr-2" />
                                <h3 className="text-lg font-bold text-gray-900 dark:text-white">Удалить арендатора?</h3>
                            </div>
                            <p className="text-gray-600 dark:text-gray-300 text-sm mb-6">
                                Вы уверены, что хотите полностью удалить этого арендатора? Это действие необратимо и удалит <strong>все связанные платежи</strong>.
                            </p>
                            <div className="flex justify-end space-x-3">
                                <button onClick={() => setIsDeleteModalOpen(false)} className="px-4 py-2 bg-gray-200 dark:bg-gray-700 hover:bg-gray-600 text-gray-700 dark:text-gray-200 text-sm font-medium rounded-md transition-colors">Отмена</button>
                                <button onClick={confirmDeleteTenant} className="px-4 py-2 bg-red-600 hover:bg-red-500 text-gray-900 dark:text-white text-sm font-medium rounded-md transition-colors">Удалить</button>
                            </div>
                        </div>
                    </div>
                </div>
            )}



        </div>
    );
}

function BikeStatusBadge({ status }) {
    const statusLabels = {
        available: 'Свободен',
        in_rent: 'В аренде',
        maintenance: 'Ремонт'
    };
    const statusStyles = {
        available: 'border-gray-300 dark:border-gray-600 bg-gray-100/70 dark:bg-gray-800/70 text-gray-500 dark:text-gray-400',
        in_rent: 'border-green-200/30 dark:border-green-800/30 bg-green-100/30 dark:bg-green-900/20 text-green-600 dark:text-green-400',
        maintenance: 'border-orange-200/30 dark:border-orange-800/30 bg-orange-100/30 dark:bg-orange-900/20 text-orange-600 dark:text-orange-400'
    };
    const dotStyles = {
        available: 'bg-gray-400',
        in_rent: 'bg-green-500',
        maintenance: 'bg-orange-500'
    };

    return (
        <span className={`inline-flex items-center gap-1 rounded-md border px-1.5 py-1 text-[10px] font-bold uppercase tracking-wide whitespace-nowrap ${statusStyles[status] || statusStyles.available}`}>
            <span className={`h-2 w-2 rounded-full ${dotStyles[status] || dotStyles.available}`} aria-hidden="true" />
            {statusLabels[status] || 'Статус неизвестен'}
        </span>
    );
}

function BikeSelector({ bikes, selectedBikeId, onChange }) {
    const [isOpen, setIsOpen] = useState(false);
    const selectedBike = bikes.find(bike => bike.id === selectedBikeId);

    return (
        <div className="relative mt-1">
            <button
                type="button"
                aria-haspopup="listbox"
                aria-expanded={isOpen}
                onClick={() => setIsOpen(current => !current)}
                className="flex w-full items-center justify-between rounded-md bg-gray-200 dark:bg-gray-700 border border-gray-400 dark:border-gray-600 text-gray-900 dark:text-white py-2 px-3 text-left focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 sm:text-sm"
            >
                <span className="truncate">{selectedBike?.model || 'Нет велосипеда'}</span>
                <ChevronDown className={`ml-2 h-4 w-4 flex-shrink-0 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
            </button>
            {isOpen && (
                <div className="absolute left-0 right-0 z-30 mt-1 max-h-64 overflow-y-auto rounded-md border border-gray-400 dark:border-gray-600 bg-white dark:bg-gray-800 p-1 shadow-xl" role="listbox">
                    <button
                        type="button"
                        role="option"
                        aria-selected={!selectedBikeId}
                        onClick={() => { onChange(''); setIsOpen(false); }}
                        className="flex w-full items-center justify-between rounded px-3 py-2 text-left text-sm text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700"
                    >
                        <span>Нет велосипеда</span>
                    </button>
                    {bikes.map(bike => (
                        <button
                            key={bike.id}
                            type="button"
                            role="option"
                            aria-selected={bike.id === selectedBikeId}
                            onClick={() => { onChange(bike.id); setIsOpen(false); }}
                            className="flex w-full items-center justify-between gap-3 rounded px-3 py-2 text-left text-sm text-gray-900 dark:text-white hover:bg-gray-100 dark:hover:bg-gray-700"
                        >
                            <span className="min-w-0 truncate">{bike.model}</span>
                            <BikeStatusBadge status={bike.status} />
                        </button>
                    ))}
                </div>
            )}
        </div>
    );
}

function PaymentLedgerList({ entries, payments, onEditPayment, onEditExpected, onDeletePayment, onEditAdjustment, onDeleteAdjustment }) {
    return (
        <div className="flow-root mt-6 max-h-[32rem] overflow-y-auto pr-1">
            <ul className="space-y-3">
                {[...entries].reverse().map((entry) => {
                    const isExpected = entry.type === 'expected';
                    const isAdjustment = entry.type === 'adjustment';
                    const balanceLabel = entry.balance > 0
                        ? `−${entry.balance}\u00A0zł`
                        : entry.balance < 0
                            ? `+${Math.abs(entry.balance)}\u00A0zł`
                            : 'Оплачено';
                    const weekday = getPaymentDayAbbreviation(entry.date);
                    const payment = !isExpected && !isAdjustment ? payments.find(item => item.id === entry.paymentId) : null;
                    const entryTitle = isExpected
                        ? 'Ожидаемый платеж'
                        : isAdjustment
                            ? (entry.direction === 'charge' ? 'Корректировка: увеличить долг' : 'Корректировка: списать долг')
                            : 'Оплата';
                    const amountPrefix = isExpected || (isAdjustment && entry.direction === 'charge') ? '+' : '−';
                    const amountClass = isExpected
                        ? 'text-gray-700 dark:text-gray-200'
                        : isAdjustment && entry.direction === 'charge'
                            ? 'text-orange-400'
                            : 'text-green-400';

                    return (
                        <li key={`${entry.type}-${entry.dateKey}-${entry.paymentId || entry.adjustmentId || 'scheduled'}`} className="rounded-lg border border-gray-200 dark:border-gray-700 bg-gray-50/50 dark:bg-gray-900/30 p-3">
                            <div className="flex items-start gap-3">
                                <span className={`mt-0.5 h-8 w-8 flex-shrink-0 rounded-full flex items-center justify-center border ${isExpected ? 'bg-white/10 border-white/20' : isAdjustment ? 'bg-orange-900/30 border-orange-700/50' : 'bg-indigo-900/50 border-indigo-700/50'}`}>
                                    {isExpected ? <Calendar className="h-4 w-4 text-white" /> : isAdjustment ? <Pencil className="h-4 w-4 text-orange-400" /> : <DollarSign className="h-4 w-4 text-indigo-400" />}
                                </span>
                                <div className="min-w-0 flex-1">
                                    <div className="flex items-start justify-between gap-3">
                                        <div>
                                            <div className="font-semibold text-gray-900 dark:text-white">{entryTitle}</div>
                                            <time className="text-xs text-gray-500 dark:text-gray-400" dateTime={entry.dateKey}>
                                                {format(entry.date, 'dd.MM.yy')}, {weekday}
                                            </time>
                                        </div>
                                        <span className={`whitespace-nowrap font-bold ${amountClass}`}>
                                            {amountPrefix}{entry.amount}&nbsp;zł
                                        </span>
                                    </div>
                                    <div className="mt-2 flex items-center justify-between gap-3 text-xs">
                                        <span className="text-gray-500 dark:text-gray-400">Баланс</span>
                                        <span className={`font-bold ${entry.balance > 0 ? 'text-red-400' : entry.balance < 0 ? 'text-yellow-400' : 'text-green-400'}`}>
                                            {balanceLabel}
                                        </span>
                                    </div>
                                    {entry.comment && (
                                        <p className="mt-2 border-t border-gray-200 dark:border-gray-700 pt-2 text-xs text-gray-600 dark:text-gray-300 whitespace-pre-line">
                                            {entry.comment}
                                        </p>
                                    )}
                                </div>
                                {isExpected && entry.isCurrentExpected ? (
                                    <button onClick={() => onEditExpected(entry)} className="text-gray-500 dark:text-gray-400 hover:text-indigo-400 transition-colors p-1.5 rounded bg-gray-200/50 dark:bg-gray-700/50 border border-gray-600/50" title="Изменить ожидаемый платеж">
                                        <Pencil className="w-4 h-4" />
                                    </button>
                                ) : isAdjustment ? (
                                    <div className="flex gap-1">
                                        <button onClick={() => onEditAdjustment({ id: entry.adjustmentId, amount: entry.amount, direction: entry.direction, adjustment_date: entry.dateKey, comment: entry.comment || '' })} className="text-gray-500 dark:text-gray-400 hover:text-indigo-400 transition-colors p-1.5 rounded bg-gray-200/50 dark:bg-gray-700/50 border border-gray-600/50" title="Изменить корректировку">
                                            <Pencil className="w-4 h-4" />
                                        </button>
                                        <button onClick={() => onDeleteAdjustment(entry.adjustmentId)} className="text-red-400 hover:text-gray-900 dark:text-white hover:bg-red-500 transition-colors p-1.5 rounded bg-red-900/20 border border-red-500/20" title="Удалить корректировку">
                                            <Trash2 className="w-4 h-4" />
                                        </button>
                                    </div>
                                ) : !isExpected && payment ? (
                                    <div className="flex gap-1">
                                        <button onClick={() => onEditPayment(payment)} className="text-gray-500 dark:text-gray-400 hover:text-indigo-400 transition-colors p-1.5 rounded bg-gray-200/50 dark:bg-gray-700/50 border border-gray-600/50">
                                            <Pencil className="w-4 h-4" />
                                        </button>
                                        <button onClick={() => onDeletePayment(entry.paymentId)} className="text-red-400 hover:text-gray-900 dark:text-white hover:bg-red-500 transition-colors p-1.5 rounded bg-red-900/20 border border-red-500/20">
                                            <Trash2 className="w-4 h-4" />
                                        </button>
                                    </div>
                                ) : null}
                            </div>
                        </li>
                    );
                })}
                {entries.length === 0 && (
                    <div className="text-center py-4 text-gray-400 dark:text-gray-500 text-sm">Платежей пока нет</div>
                )}
            </ul>
        </div>
    );
}

function AdjustmentModalForm({ tenant, adjustment, onClose, onSuccess }) {
    const isEdit = !!adjustment;
    const [direction, setDirection] = useState(adjustment?.direction || 'credit');
    const [amount, setAmount] = useState(adjustment?.amount || '');
    const [adjustmentDate, setAdjustmentDate] = useState(adjustment?.adjustment_date || format(new Date(), 'yyyy-MM-dd'));
    const [comment, setComment] = useState(adjustment?.comment || '');
    const [loading, setLoading] = useState(false);

    const handleSubmit = async (e) => {
        e.preventDefault();
        setLoading(true);

        const payload = {
            tenant_id: tenant.id,
            direction,
            amount: Number(amount),
            adjustment_date: adjustmentDate,
            comment: comment.trim()
        };
        const response = isEdit
            ? await supabase.from('tenant_payment_adjustments').update(payload).eq('id', adjustment.id)
            : await supabase.from('tenant_payment_adjustments').insert(payload);

        setLoading(false);
        if (!response.error) onSuccess();
        else alert(response.error.message);
    };

    return (
        <div>
            <div className="flex justify-between items-center mb-4">
                <h3 className="text-lg font-medium leading-6 text-gray-900 dark:text-white">{isEdit ? 'Редактировать корректировку' : 'Добавить корректировку'}</h3>
                <button onClick={onClose} className="text-gray-500 dark:text-gray-400 hover:text-gray-900 dark:text-white transition-colors bg-gray-200/50 dark:bg-gray-700/50 hover:bg-gray-200 dark:bg-gray-700 p-1 rounded-md">
                    <X className="w-5 h-5" />
                </button>
            </div>
            <form onSubmit={handleSubmit} className="space-y-4">
                <div>
                    <label className="block text-sm font-medium text-gray-600 dark:text-gray-300">Действие</label>
                    <select value={direction} onChange={e => setDirection(e.target.value)} className="mt-1 block w-full rounded-md bg-gray-200 dark:bg-gray-700 border border-gray-400 dark:border-gray-600 text-gray-900 dark:text-white py-2 px-3 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 sm:text-sm">
                        <option value="credit">Списать долг</option>
                        <option value="charge">Увеличить долг</option>
                    </select>
                </div>
                <div>
                    <label className="block text-sm font-medium text-gray-600 dark:text-gray-300">Сумма (zł)</label>
                    <input type="number" min="0.01" step="0.01" required value={amount} onChange={e => setAmount(e.target.value)} className="mt-1 block w-full rounded-md bg-gray-200 dark:bg-gray-700 border border-gray-400 dark:border-gray-600 text-gray-900 dark:text-white py-2 px-3 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 sm:text-sm" />
                </div>
                <div>
                    <label className="block text-sm font-medium text-gray-600 dark:text-gray-300">Дата</label>
                    <input type="date" required value={adjustmentDate} onChange={e => setAdjustmentDate(e.target.value)} className="mt-1 block w-full rounded-md bg-gray-200 dark:bg-gray-700 border border-gray-400 dark:border-gray-600 text-gray-900 dark:text-white py-2 px-3 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 sm:text-sm" style={{ colorScheme: 'dark' }} />
                </div>
                <div>
                    <label className="block text-sm font-medium text-gray-600 dark:text-gray-300">Причина корректировки</label>
                    <textarea required value={comment} onChange={e => setComment(e.target.value)} rows="3" placeholder="Например: списание долга по договорённости" className="mt-1 block w-full rounded-md bg-gray-200 dark:bg-gray-700 border border-gray-400 dark:border-gray-600 text-gray-900 dark:text-white py-2 px-3 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 sm:text-sm" />
                </div>
                <div className="mt-5 sm:mt-6 sm:grid sm:grid-flow-row-dense sm:grid-cols-2 sm:gap-3">
                    <button type="submit" disabled={loading} className="inline-flex w-full justify-center rounded-md border border-transparent bg-indigo-600 px-4 py-2 text-base font-medium text-gray-900 dark:text-white shadow-sm hover:bg-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 focus:ring-offset-gray-900 sm:col-start-2 sm:text-sm disabled:opacity-50">Сохранить</button>
                    <button type="button" onClick={onClose} className="mt-3 inline-flex w-full justify-center rounded-md border border-gray-400 dark:border-gray-600 bg-gray-200 dark:bg-gray-700 px-4 py-2 text-base font-medium text-gray-600 dark:text-gray-300 shadow-sm hover:bg-gray-600 sm:col-start-1 sm:mt-0 sm:text-sm transition-colors">Отмена</button>
                </div>
            </form>
        </div>
    );
}

function PaymentModalForm({ tenant, payment, onClose, onSuccess }) {
    const isEdit = !!payment;
    const [amount, setAmount] = useState(payment?.amount || getTenantWeeklyPayment(tenant) || '');
    const [paymentDate, setPaymentDate] = useState(payment?.payment_date ? format(new Date(payment.payment_date), 'yyyy-MM-dd') : format(new Date(), 'yyyy-MM-dd'));
    const [comment, setComment] = useState(payment?.comment || '');
    const [loading, setLoading] = useState(false);

    const handleSubmit = async (e) => {
        e.preventDefault();
        setLoading(true);

        const payload = {
            tenant_id: tenant.id,
            amount: Number(amount),
            payment_date: paymentDate,
            comment: comment.trim() || null
        };

        let response;
        if (isEdit && payment.isExpected) {
            response = await supabase.from('tenants').update({
                next_payment_date: paymentDate,
                next_payment_amount: Number(amount),
                next_payment_comment: comment.trim() || null
            }).eq('id', tenant.id);
            setLoading(false);
            if (!response.error) onSuccess();
            else alert(response.error.message);
        } else if (isEdit) {
            response = await supabase.from('payments').update(payload).eq('id', payment.id);
            setLoading(false);
            if (!response.error) onSuccess();
            else alert(response.error.message);
        } else {
            response = await supabase.rpc('record_tenant_payment', {
                p_tenant_id: tenant.id,
                p_amount: Number(amount),
                p_payment_date: paymentDate,
                p_comment: comment.trim() || null
            });
            if (!response.error) {
                setLoading(false);
                onSuccess();
            } else {
                setLoading(false);
                alert(response.error.message);
            }
        }
    };

    return (
        <div>
            <div className="flex justify-between items-center mb-4">
                <h3 className="text-lg font-medium leading-6 text-gray-900 dark:text-white">{isEdit ? (payment.isExpected ? 'Редактировать ожидаемый платеж' : 'Редактировать платеж') : 'Добавить платеж'}</h3>
                <button onClick={onClose} className="text-gray-500 dark:text-gray-400 hover:text-gray-900 dark:text-white transition-colors bg-gray-200/50 dark:bg-gray-700/50 hover:bg-gray-200 dark:bg-gray-700 p-1 rounded-md">
                    <X className="w-5 h-5" />
                </button>
            </div>
            <form onSubmit={handleSubmit} className="space-y-4">
                <div>
                    <label className="block text-sm font-medium text-gray-600 dark:text-gray-300">Сумма (zł)</label>
                    <input type="number" required value={amount} onChange={e => setAmount(e.target.value)} className="mt-1 block w-full rounded-md bg-gray-200 dark:bg-gray-700 border border-gray-400 dark:border-gray-600 text-gray-900 dark:text-white py-2 px-3 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 sm:text-sm" />
                </div>
                <div>
                    <label className="block text-sm font-medium text-gray-600 dark:text-gray-300">Дата платежа</label>
                    <div className="relative mt-1">
                        <input type="date" required value={paymentDate} onChange={e => setPaymentDate(e.target.value)} className="block w-full appearance-none rounded-md bg-gray-200 dark:bg-gray-700 border border-gray-400 dark:border-gray-600 text-gray-900 dark:text-white py-2 px-3 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 sm:text-sm" style={{ colorScheme: 'dark' }} />
                    </div>
                </div>
                <div>
                    <label className="block text-sm font-medium text-gray-600 dark:text-gray-300">Комментарий</label>
                    <textarea value={comment} onChange={e => setComment(e.target.value)} rows="3" placeholder="Например: частичная оплата, перенос, договорённость" className="mt-1 block w-full rounded-md bg-gray-200 dark:bg-gray-700 border border-gray-400 dark:border-gray-600 text-gray-900 dark:text-white py-2 px-3 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 sm:text-sm" />
                </div>
                <div className="mt-5 sm:mt-6 sm:grid sm:grid-flow-row-dense sm:grid-cols-2 sm:gap-3">
                    <button type="submit" disabled={loading} className="inline-flex w-full justify-center rounded-md border border-transparent bg-indigo-600 px-4 py-2 text-base font-medium text-gray-900 dark:text-white shadow-sm hover:bg-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 focus:ring-offset-gray-900 sm:col-start-2 sm:text-sm disabled:opacity-50">
                        Сохранить
                    </button>
                    <button type="button" onClick={onClose} className="mt-3 inline-flex w-full justify-center rounded-md border border-gray-400 dark:border-gray-600 bg-gray-200 dark:bg-gray-700 px-4 py-2 text-base font-medium text-gray-600 dark:text-gray-300 shadow-sm hover:bg-gray-600 sm:col-start-1 sm:mt-0 sm:text-sm transition-colors">
                        Отмена
                    </button>
                </div>
            </form>
        </div>
    );
}
