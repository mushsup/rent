import { useParams, Link, useNavigate } from 'react-router-dom';
import { useState, useEffect } from 'react';
import { getTenantWeeklyPayment } from '../../utils/calculateDebt';
import { buildPaymentLedger } from '../../utils/paymentLedger';
import { format } from 'date-fns';
import { DEFAULT_PAYMENT_DAY, PAYMENT_DAYS, getPaymentDay, getScheduledPaymentDate } from '../../utils/paymentSchedule';
import { ArrowLeft, Edit2, Trash2, AlertCircle, X, Archive, ChevronDown, Phone, Send, Plus, Bike as BikeIcon, Banknote, MoreHorizontal, Check } from 'lucide-react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import type { Bike, DeletableRecord, PaymentAdjustment, PaymentEditorValue, TenantDetail, TenantEditForm } from '../../types';
import { deleteTenant, deleteTenantRecord, fetchBikes, fetchTenantDetail, saveAdjustment, savePayment, setTenantArchived, updateTenantProfile } from '../../features/tenants/api';

type LedgerModalEntry =
    | { type: 'payment'; value: PaymentEditorValue | null }
    | { type: 'adjustment'; value: PaymentAdjustment }
    | null;

function normalizeTelegramUsername(value: string | null | undefined): string {
    return (value || '').trim().replace(/^https?:\/\/t\.me\//i, '').replace(/^@/, '');
}

function getPhoneHref(phone) {
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
    const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
    const [deletingRecord, setDeletingRecord] = useState<DeletableRecord | null>(null);
    const [editForm, setEditForm] = useState<TenantEditForm | null>(null);

    const { data: bikes = [], isError: bikesError } = useQuery<Bike[]>({
        queryKey: ['bikes'],
        queryFn: fetchBikes
    });

    const { data: tenant, isLoading: loading, isError: tenantError, error: tenantQueryError } = useQuery<TenantDetail | null>({
        queryKey: ['tenant', id],
        queryFn: () => fetchTenantDetail(id!),
        enabled: Boolean(id)
    });

    useEffect(() => {
        if (tenant && !editForm) {
            setEditForm({ ...tenant, bike_id: tenant.bikes?.id || '', weekly_payment: tenant.weekly_payment ?? '' });
        }
    }, [tenant, editForm]);

    const confirmDeleteRecord = async () => {
        if (!deletingRecord) return;

        try {
            await deleteTenantRecord(deletingRecord);
        } catch (error) {
            alert(error.message);
            return;
        }

        setDeletingRecord(null);
        queryClient.invalidateQueries({ queryKey: ['tenant', id] });
        queryClient.invalidateQueries({ queryKey: ['tenants'] });
    };

    const handleUpdateTenant = async (e) => {
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
            queryClient.invalidateQueries({ queryKey: ['tenant', id] });
            queryClient.invalidateQueries({ queryKey: ['tenants'] });
            queryClient.invalidateQueries({ queryKey: ['bikes'] });
        } catch (error) {
            alert(error.message);
        }
    };

    const confirmToggleArchive = async () => {
        const newArchivedState = !tenant.is_archived;
        try {
            await setTenantArchived(id!, newArchivedState);
            queryClient.invalidateQueries({ queryKey: ['tenants'] });
            queryClient.invalidateQueries({ queryKey: ['bikes'] });
            navigate('/admin');
        } catch (error) {
            alert(error.message);
        }
    };

    const confirmDeleteTenant = async () => {
        try {
            await deleteTenant(id!);
            queryClient.invalidateQueries({ queryKey: ['tenants'] });
            navigate('/admin');
        } catch (error) {
            alert(error.message);
        }
    };

    if (loading) return <div className="text-slate-600 dark:text-slate-300 p-8">Загрузка...</div>;
    if (tenantError || bikesError) return <div className="text-red-400 p-8">Не удалось загрузить арендатора. {tenantQueryError?.message || 'Проверьте подключение к базе данных.'}</div>;
    if (!tenant || !editForm) return <div className="text-red-400 p-8">Арендатор не найден</div>;

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
                <Link to="/admin" className="text-sm font-medium text-lime-400 hover:text-lime-300 flex items-center">
                    <ArrowLeft className="w-4 h-4 mr-1" /> Вернуться к списку
                </Link>
            </div>

            <div className="bg-white dark:bg-slate-900 rounded-lg shadow-sm border border-slate-200 dark:border-slate-800 overflow-hidden p-4 sm:p-6 relative">
                {!isEditing ? (
                    <>
                        <button onClick={() => setIsEditing(true)} className="absolute top-6 right-6 text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white transition-colors bg-slate-200/50 dark:bg-slate-700/50 p-2 rounded-lg">
                            <Edit2 className="w-5 h-5" />
                        </button>
                        <h1 className="text-2xl font-bold text-slate-900 dark:text-white pr-10 flex items-center gap-3">
                            {tenant.name}
                            {tenant.is_archived && <span className="bg-slate-200 dark:bg-slate-700 text-slate-600 dark:text-slate-300 px-2.5 py-1 rounded text-xs uppercase font-bold tracking-wider">Архив</span>}
                        </h1>
                        <p className="text-lime-400 font-medium mt-1">/{tenant.slug} — <span className="text-slate-500 dark:text-slate-400">{tenant.bikes?.model || 'Нет велосипеда'}</span></p>

                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm mt-6 border-t border-slate-200 dark:border-slate-800 pt-6">
                            <div className="bg-slate-100 dark:bg-slate-700/50 p-3 rounded-lg border border-slate-200 dark:border-slate-800">
                                <span className="block text-slate-400 dark:text-slate-500 mb-1">Ставка в неделю:</span>
                                <span className="font-semibold text-slate-900 dark:text-white text-lg">{getTenantWeeklyPayment(tenant)}&nbsp;zł</span>
                            </div>
                            <div className="bg-slate-100 dark:bg-slate-700/50 p-3 rounded-lg border border-slate-200 dark:border-slate-800">
                                <span className="block text-slate-400 dark:text-slate-500 mb-1">Депозит:</span>
                                <span className="font-semibold text-slate-900 dark:text-white text-lg">{tenant.deposit || 0}&nbsp;zł</span>
                            </div>
                            <div className="bg-slate-100 dark:bg-slate-700/50 p-3 rounded-lg border border-slate-200 dark:border-slate-800">
                                <span className="block text-slate-400 dark:text-slate-500 mb-2">Телефон:</span>
                                {tenant.phone ? (
                                    <a href={getPhoneHref(tenant.phone)} className="inline-flex items-center gap-2 font-semibold text-lime-500 hover:text-lime-400">
                                        <Phone className="h-4 w-4" /> {tenant.phone}
                                    </a>
                                ) : <span className="text-slate-500 dark:text-slate-400">Не указан</span>}
                            </div>
                            <div className="bg-slate-100 dark:bg-slate-700/50 p-3 rounded-lg border border-slate-200 dark:border-slate-800">
                                <span className="block text-slate-400 dark:text-slate-500 mb-2">Telegram:</span>
                                {tenant.telegram_username ? (
                                    <a href={`https://t.me/${normalizeTelegramUsername(tenant.telegram_username)}`} target="_blank" rel="noreferrer" className="inline-flex items-center gap-2 font-semibold text-lime-500 hover:text-lime-400">
                                        <Send className="h-4 w-4" /> @{normalizeTelegramUsername(tenant.telegram_username)}
                                    </a>
                                ) : <span className="text-slate-500 dark:text-slate-400">Не указан</span>}
                            </div>
                            <div className="sm:col-span-2 bg-teal-900/10 border border-teal-900/30 p-4 rounded-lg">
                                <span className="block text-slate-500 dark:text-slate-400 mb-1 text-xs uppercase tracking-wider">Заметка администратора</span>
                                <span className="text-slate-600 dark:text-slate-300 whitespace-pre-line">{tenant.admin_comment || 'Нет комментария'}</span>
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
                                <BikeSelector
                                    bikes={sortedBikes}
                                    selectedBikeId={editForm.bike_id}
                                    onChange={(bikeId) => setEditForm({ ...editForm, bike_id: bikeId })}
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
                            <button type="submit" className="rounded-md border border-transparent bg-lime-600 py-2 px-4 shadow-sm text-sm font-medium text-slate-900 dark:text-white hover:bg-lime-500 transition-colors">Сохранить</button>
                        </div>
                    </form>
                )}
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mt-6">
                <div className="md:col-span-2 bg-white dark:bg-slate-900 rounded-lg shadow border border-slate-200 dark:border-slate-800 p-4 sm:p-6">
                    <div className="mb-4 grid grid-cols-[minmax(0,1fr)_auto_auto] items-center gap-3">
                        <h3 className="text-lg font-medium text-slate-900 dark:text-white">Баланс</h3>
                        <div className={`flex items-center gap-1 text-base font-bold ${paymentLedger.currentBalance > 0 ? 'text-red-500 dark:text-red-400' : 'text-lime-700 dark:text-lime-400'}`}>
                            {paymentLedger.currentBalance > 0 ? `${paymentLedger.currentBalance} zł` : '0 zł'}
                            {paymentLedger.currentBalance <= 0 && <Check className="h-4 w-4" />}
                        </div>
                        <button title="Добавить запись" onClick={() => { setEditingLedgerEntry({ type: 'payment', value: null }); setIsLedgerModalOpen(true); }} className="inline-flex items-center justify-center rounded-md bg-lime-500 p-2 text-slate-950 transition-colors hover:bg-lime-400">
                            <Plus className="w-5 h-5" />
                        </button>
                    </div>
                    <PaymentLedgerList
                        entries={paymentLedger.entries}
                        payments={tenant.payments}
                        onEditPayment={(payment) => { setEditingLedgerEntry({ type: 'payment', value: payment }); setIsLedgerModalOpen(true); }}
                        onDeletePayment={(paymentId) => setDeletingRecord({ type: 'payment', id: paymentId })}
                        onEditAdjustment={(adjustment) => { setEditingLedgerEntry({ type: 'adjustment', value: adjustment }); setIsLedgerModalOpen(true); }}
                        onDeleteAdjustment={(adjustmentId) => setDeletingRecord({ type: 'adjustment', id: adjustmentId })}
                    />
                </div>
            </div>

            {/* Delete Confirmation Modal */}
            {deletingRecord && (
                <div className="fixed inset-0 z-50">
                    <div className="fixed inset-0 bg-slate-900/80 backdrop-blur-sm" onClick={(e) => { e.stopPropagation(); setDeletingRecord(null); }} />
                    <div className="fixed inset-0 z-10 flex items-center justify-center p-4 pointer-events-none">
                        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg max-w-sm w-full p-6 shadow-2xl relative pointer-events-auto">
                            <button onClick={() => setDeletingRecord(null)} className="absolute top-4 right-4 text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white transition-colors bg-slate-200/50 dark:bg-slate-700/50 hover:bg-slate-200 dark:hover:bg-slate-700 p-1 rounded-md">
                                <X className="w-5 h-5" />
                            </button>
                            <div className="flex items-center text-red-400 mb-4 pr-6">
                                <AlertCircle className="w-6 h-6 mr-2" />
                                <h3 className="text-lg font-bold text-slate-900 dark:text-white">Удалить {deletingRecord.type === 'adjustment' ? 'корректировку' : 'платеж'}?</h3>
                            </div>
                            <p className="text-slate-600 dark:text-slate-300 text-sm mb-6">Эта операция удалит запись из истории. Баланс арендатора будет пересчитан. Отменить действие будет невозможно.</p>
                            <div className="flex justify-end space-x-3">
                                <button onClick={() => setDeletingRecord(null)} className="px-4 py-2 bg-slate-200 dark:bg-slate-700 hover:bg-slate-600 text-slate-700 dark:text-slate-200 text-sm font-medium rounded-md transition-colors">Отмена</button>
                                <button onClick={confirmDeleteRecord} className="px-4 py-2 bg-red-600 hover:bg-red-500 text-slate-900 dark:text-white text-sm font-medium rounded-md transition-colors">Удалить</button>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {isLedgerModalOpen && (
                <div className="fixed inset-0 z-50">
                    <div className="fixed inset-0 bg-slate-900/80 backdrop-blur-sm transition-opacity" onClick={(e) => { e.stopPropagation(); setIsLedgerModalOpen(false); }} />
                    <div className="fixed inset-0 z-10 flex items-center justify-center p-4 pointer-events-none">
                        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg max-w-sm w-full p-6 shadow-2xl relative pointer-events-auto">
                            <LedgerModalForm entry={editingLedgerEntry} tenant={tenant} onClose={() => setIsLedgerModalOpen(false)} onSuccess={() => { setIsLedgerModalOpen(false); queryClient.invalidateQueries({ queryKey: ['tenant', id] }); queryClient.invalidateQueries({ queryKey: ['tenants'] }); }} />
                        </div>
                    </div>
                </div>
            )}

            {/* Archive Confirmation Modal */}
            {isArchiveModalOpen && (
                <div className="fixed inset-0 z-50">
                    <div className="fixed inset-0 bg-slate-900/80 backdrop-blur-sm" onClick={(e) => { e.stopPropagation(); setIsArchiveModalOpen(false); }} />
                    <div className="fixed inset-0 z-10 flex items-center justify-center p-4 pointer-events-none">
                        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg max-w-sm w-full p-6 shadow-2xl relative pointer-events-auto">
                            <button onClick={() => setIsArchiveModalOpen(false)} className="absolute top-4 right-4 text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white transition-colors bg-slate-200/50 dark:bg-slate-700/50 hover:bg-slate-200 dark:hover:bg-slate-700 p-1 rounded-md">
                                <X className="w-5 h-5" />
                            </button>
                            <div className="flex items-center text-orange-400 mb-4 pr-6">
                                <Archive className="w-6 h-6 mr-2" />
                                <h3 className="text-lg font-bold text-slate-900 dark:text-white">{tenant.is_archived ? "Вернуть из архива?" : "В архив?"}</h3>
                            </div>
                            <p className="text-slate-600 dark:text-slate-300 text-sm mb-6">
                                {tenant.is_archived
                                    ? "Арендатор снова появится в общем списке активных клиентов."
                                    : "Арендатор будет скрыт, велосипед станет свободным, а у арендатора будет выбран вариант «Нет велосипеда». Будущие автоматические начисления остановятся."}
                            </p>
                            <div className="flex justify-end space-x-3">
                                <button onClick={() => setIsArchiveModalOpen(false)} className="px-4 py-2 bg-slate-200 dark:bg-slate-700 hover:bg-slate-600 text-slate-700 dark:text-slate-200 text-sm font-medium rounded-md transition-colors">Отмена</button>
                                <button onClick={confirmToggleArchive} className="px-4 py-2 bg-orange-600 hover:bg-orange-500 text-slate-900 dark:text-white text-sm font-medium rounded-md transition-colors">
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
                    <div className="fixed inset-0 bg-slate-900/80 backdrop-blur-sm" onClick={(e) => { e.stopPropagation(); setIsDeleteModalOpen(false); }} />
                    <div className="fixed inset-0 z-10 flex items-center justify-center p-4 pointer-events-none">
                        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg max-w-sm w-full p-6 shadow-2xl relative pointer-events-auto">
                            <button onClick={() => setIsDeleteModalOpen(false)} className="absolute top-4 right-4 text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white transition-colors bg-slate-200/50 dark:bg-slate-700/50 hover:bg-slate-200 dark:hover:bg-slate-700 p-1 rounded-md">
                                <X className="w-5 h-5" />
                            </button>
                            <div className="flex items-center text-red-500 mb-4 pr-6">
                                <AlertCircle className="w-6 h-6 mr-2" />
                                <h3 className="text-lg font-bold text-slate-900 dark:text-white">Удалить арендатора?</h3>
                            </div>
                            <p className="text-slate-600 dark:text-slate-300 text-sm mb-6">
                                Вы уверены, что хотите полностью удалить этого арендатора? Это действие необратимо и удалит <strong>все связанные платежи</strong>.
                            </p>
                            <div className="flex justify-end space-x-3">
                                <button onClick={() => setIsDeleteModalOpen(false)} className="px-4 py-2 bg-slate-200 dark:bg-slate-700 hover:bg-slate-600 text-slate-700 dark:text-slate-200 text-sm font-medium rounded-md transition-colors">Отмена</button>
                                <button onClick={confirmDeleteTenant} className="px-4 py-2 bg-red-600 hover:bg-red-500 text-slate-900 dark:text-white text-sm font-medium rounded-md transition-colors">Удалить</button>
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
        available: 'border-slate-300 dark:border-slate-600 bg-slate-100/70 dark:bg-slate-900/70 text-slate-500 dark:text-slate-400',
        in_rent: 'border-green-200/30 dark:border-green-800/30 bg-green-100/30 dark:bg-green-900/20 text-green-600 dark:text-green-400',
        maintenance: 'border-orange-200/30 dark:border-orange-800/30 bg-orange-100/30 dark:bg-orange-900/20 text-orange-600 dark:text-orange-400'
    };
    const dotStyles = {
        available: 'bg-slate-400',
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
                className="flex w-full items-center justify-between rounded-md bg-slate-200 dark:bg-slate-700 border border-slate-400 dark:border-slate-600 text-slate-900 dark:text-white py-2 px-3 text-left focus:border-lime-500 focus:ring-1 focus:ring-lime-500 sm:text-sm"
            >
                <span className="truncate">{selectedBike?.model || 'Нет велосипеда'}</span>
                <ChevronDown className={`ml-2 h-4 w-4 flex-shrink-0 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
            </button>
            {isOpen && (
                <div className="absolute left-0 right-0 z-30 mt-1 max-h-64 overflow-y-auto rounded-md border border-slate-400 dark:border-slate-600 bg-white dark:bg-slate-900 p-1 shadow-xl" role="listbox">
                    <button
                        type="button"
                        role="option"
                        aria-selected={!selectedBikeId}
                        onClick={() => { onChange(''); setIsOpen(false); }}
                        className="flex w-full items-center justify-between rounded px-3 py-2 text-left text-sm text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700"
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
                            className="flex w-full items-center justify-between gap-3 rounded px-3 py-2 text-left text-sm text-slate-900 dark:text-white hover:bg-slate-100 dark:hover:bg-slate-700"
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

function PaymentLedgerList({ entries, payments, onEditPayment, onDeletePayment, onEditAdjustment, onDeleteAdjustment }) {
    const visibleEntries = [...entries].reverse();

    return (
        <div className="flow-root max-h-[32rem] overflow-y-auto pr-1">
            <ul className="divide-y divide-slate-200/70 dark:divide-slate-800/70">
                {visibleEntries.map((entry) => {
                    const isExpected = entry.type === 'expected';
                    const isAdjustment = entry.type === 'adjustment';
                    const payment = !isExpected && !isAdjustment ? payments.find(item => item.id === entry.paymentId) : null;
                    const isCharge = isAdjustment && entry.direction === 'charge';
                    const amountPrefix = isExpected || isCharge ? '−' : '+';
                    const amountClass = isExpected
                        ? 'text-slate-700 dark:text-white'
                        : isAdjustment
                            ? 'text-slate-500 dark:text-slate-300'
                            : 'text-lime-700 dark:text-lime-400';
                    const balanceLabel = entry.balance > 0 ? `${entry.balance} zł` : '0 zł';

                    return (
                        <li key={`${entry.type}-${entry.dateKey}-${entry.paymentId || entry.adjustmentId}`} className="group grid grid-cols-[auto_minmax(0,1fr)_auto_auto] items-start gap-3 py-4 first:pt-1 last:pb-1">
                            <span className={`mt-0.5 flex h-8 w-8 flex-shrink-0 items-center justify-center ${isExpected ? 'text-slate-500 dark:text-white' : isAdjustment ? 'text-slate-500 dark:text-slate-400' : 'text-lime-600 dark:text-lime-400'}`}>
                                {isExpected || isAdjustment ? <BikeIcon className="h-5 w-5" /> : <Banknote className="h-5 w-5" />}
                            </span>
                            <div className="min-w-0 flex-1">
                                <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
                                    <span className={`font-semibold ${amountClass}`}>{amountPrefix}{entry.amount} zł</span>
                                    <time className="text-xs text-slate-500 dark:text-slate-400" dateTime={entry.dateKey}>{format(entry.date, 'dd.MM.yy')}</time>
                                    {!isExpected && !isAdjustment && <span className="text-xs text-lime-700 dark:text-lime-400">Оплата</span>}
                                    {isAdjustment && <span className="text-xs text-slate-500 dark:text-slate-400">Корректировка</span>}
                                </div>
                                {entry.comment && <p className="mt-1 whitespace-pre-line text-sm text-slate-600 dark:text-slate-300">{entry.comment}</p>}
                            </div>
                            <span className={`pt-1 whitespace-nowrap text-sm font-semibold ${entry.balance > 0 ? 'text-red-500 dark:text-red-400' : 'text-lime-700 dark:text-lime-400'}`}>
                                {balanceLabel}
                            </span>
                            {(isAdjustment || payment) && (
                                <div className="relative flex-shrink-0">
                                    <details className="group/menu">
                                        <summary className="flex h-8 w-8 cursor-pointer list-none items-center justify-center rounded-md text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-900 dark:hover:bg-slate-800 dark:hover:text-white" title="Действия">
                                            <MoreHorizontal className="h-5 w-5" />
                                        </summary>
                                        <div className="absolute right-0 top-9 z-10 w-36 rounded-md border border-slate-200 bg-white p-1 shadow-lg dark:border-slate-700 dark:bg-slate-900">
                                            <button onClick={() => isAdjustment ? onEditAdjustment({ id: entry.adjustmentId, amount: entry.amount, direction: entry.direction, adjustment_date: entry.dateKey, comment: entry.comment || '' }) : onEditPayment(payment)} className="block w-full rounded px-3 py-2 text-left text-sm text-slate-700 hover:bg-slate-100 dark:text-slate-200 dark:hover:bg-slate-800">Изменить</button>
                                            <button onClick={() => isAdjustment ? onDeleteAdjustment(entry.adjustmentId) : onDeletePayment(entry.paymentId)} className="block w-full rounded px-3 py-2 text-left text-sm text-red-500 hover:bg-red-50 dark:hover:bg-red-950/40">Удалить</button>
                                        </div>
                                    </details>
                                </div>
                            )}
                        </li>
                    );
                })}
                {visibleEntries.length === 0 && <li className="py-6 text-center text-sm text-slate-400 dark:text-slate-500">Записей пока нет</li>}
            </ul>
        </div>
    );
}

function LedgerModalForm({ tenant, entry, onClose, onSuccess }) {
    const isEdit = Boolean(entry);
    const [isAdjustment, setIsAdjustment] = useState(entry?.type === 'adjustment');
    const [direction, setDirection] = useState(entry?.type === 'adjustment' ? entry.value.direction : 'credit');
    const [amount, setAmount] = useState(entry?.value.amount || getTenantWeeklyPayment(tenant) || '');
    const [date, setDate] = useState(entry?.type === 'adjustment' ? entry.value.adjustment_date : entry?.value.payment_date || format(new Date(), 'yyyy-MM-dd'));
    const [comment, setComment] = useState(entry?.value.comment || '');
    const [loading, setLoading] = useState(false);

    useEffect(() => {
        setIsAdjustment(entry?.type === 'adjustment');
        setDirection(entry?.type === 'adjustment' ? entry.value.direction : 'credit');
        setAmount(entry?.value.amount || getTenantWeeklyPayment(tenant) || '');
        setDate(entry?.type === 'adjustment' ? entry.value.adjustment_date : entry?.value.payment_date || format(new Date(), 'yyyy-MM-dd'));
        setComment(entry?.value.comment || '');
    }, [entry, tenant]);

    const handleSubmit = async (event) => {
        event.preventDefault();
        setLoading(true);
        try {
            if (isAdjustment) {
                if (!comment.trim()) throw new Error('Укажите причину корректировки');
                await saveAdjustment(tenant.id!, entry?.type === 'adjustment' ? entry.value : null, { direction, amount: Number(amount), adjustment_date: date, comment: comment.trim() });
            } else {
                await savePayment(tenant.id!, entry?.type === 'payment' ? entry.value : null, Number(amount), date, comment.trim());
            }
            onSuccess();
        } catch (error) {
            alert(error.message);
        } finally {
            setLoading(false);
        }
    };

    return (
        <div>
            <div className="mb-5 flex items-center justify-between">
                <h3 className="text-lg font-medium text-slate-900 dark:text-white">{isEdit ? (isAdjustment ? 'Редактировать корректировку' : 'Редактировать платеж') : 'Новая запись'}</h3>
                <button onClick={onClose} className="rounded-md p-1 text-slate-500 hover:bg-slate-100 hover:text-slate-900 dark:hover:bg-slate-800 dark:hover:text-white"><X className="h-5 w-5" /></button>
            </div>
            <form onSubmit={handleSubmit} className="space-y-4">
                {!isEdit && (
                    <label className="flex cursor-pointer items-center gap-3 text-sm text-slate-700 dark:text-slate-200">
                        <input type="checkbox" checked={isAdjustment} onChange={event => setIsAdjustment(event.target.checked)} className="h-4 w-4 accent-lime-500" />
                        Это корректировка
                    </label>
                )}
                {isAdjustment && <div><label className="block text-sm font-medium text-slate-600 dark:text-slate-300">Тип корректировки</label><select value={direction} onChange={event => setDirection(event.target.value)} className="mt-1 block w-full rounded-md bg-slate-100 px-3 py-2 text-slate-900 dark:bg-slate-800 dark:text-white"><option value="credit">Списать долг</option><option value="charge">Увеличить долг</option></select></div>}
                <div><label className="block text-sm font-medium text-slate-600 dark:text-slate-300">Сумма (zł)</label><input type="number" min="0.01" step="0.01" required value={amount} onChange={event => setAmount(event.target.value)} className="mt-1 block w-full rounded-md bg-slate-100 px-3 py-2 text-slate-900 dark:bg-slate-800 dark:text-white" /></div>
                <div><label className="block text-sm font-medium text-slate-600 dark:text-slate-300">Дата</label><input type="date" required value={date} onChange={event => setDate(event.target.value)} className="mt-1 block w-full rounded-md bg-slate-100 px-3 py-2 text-slate-900 dark:bg-slate-800 dark:text-white" /></div>
                <div><label className="block text-sm font-medium text-slate-600 dark:text-slate-300">{isAdjustment ? 'Причина корректировки' : 'Комментарий'}</label><textarea required={isAdjustment} value={comment} onChange={event => setComment(event.target.value)} rows={3} placeholder={isAdjustment ? 'Почему меняем баланс?' : 'Например: частичная оплата'} className="mt-1 block w-full rounded-md bg-slate-100 px-3 py-2 text-slate-900 dark:bg-slate-800 dark:text-white" /></div>
                <div className="flex justify-end gap-3 pt-2"><button type="button" onClick={onClose} className="rounded-md px-4 py-2 text-sm text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800">Отмена</button><button type="submit" disabled={loading} className="rounded-md bg-lime-500 px-4 py-2 text-sm font-semibold text-slate-950 hover:bg-lime-400 disabled:opacity-50">Сохранить</button></div>
            </form>
        </div>
    );
}
