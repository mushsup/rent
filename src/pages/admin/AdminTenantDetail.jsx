import { useParams, Link, useNavigate } from 'react-router-dom';
import { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';
import { calculateDebt } from '../../utils/calculateDebt';
import { format, parseISO, addDays } from 'date-fns';
import { ru } from 'date-fns/locale';
import { ArrowLeft, Edit2, Trash2, Calendar, DollarSign, AlertCircle, Plus, X, Archive, ChevronDown, CheckCircle, Pencil, MoreVertical } from 'lucide-react';
import toast from 'react-hot-toast';
import { useQuery, useQueryClient } from '@tanstack/react-query';
export default function AdminTenantDetail() {
    const { id } = useParams();
    const queryClient = useQueryClient();
    const navigate = useNavigate();

    const [isEditing, setIsEditing] = useState(false);
    const [isPaymentModalOpen, setIsPaymentModalOpen] = useState(false);
    const [editingPayment, setEditingPayment] = useState(null);
    const [isArchiveModalOpen, setIsArchiveModalOpen] = useState(false);
    const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
    const [deletingPaymentId, setDeletingPaymentId] = useState(null);
    const [editForm, setEditForm] = useState(null);

    const { data: bikes = [] } = useQuery({
        queryKey: ['bikes'],
        queryFn: async () => {
            const { data } = await supabase.from('bikes').select('*');
            return data || [];
        }
    });

    const { data: tenant, isLoading: loading } = useQuery({
        queryKey: ['tenant', id],
        queryFn: async () => {
            const { data } = await supabase
                .from('tenants')
                .select('*, payments(*), bikes(*)')
                .eq('id', id)
                .single();

            if (data) {
                data.payments.sort((a, b) => new Date(b.payment_date) - new Date(a.payment_date));
            }
            return data;
        },
        onSuccess: (data) => {
            if (data && !editForm) {
                setEditForm({ ...data, bike_id: data.bikes?.id || '' });
            }
        }
    });

    useEffect(() => {
        if (tenant && !editForm) {
            setEditForm({ ...tenant, bike_id: tenant.bikes?.id || '' });
        }
    }, [tenant, editForm]);

    const confirmDeletePayment = async () => {
        if (!deletingPaymentId) return;

        const { error } = await supabase.from('payments').delete().eq('id', deletingPaymentId);
        if (!error) {
            const currentNextDate = tenant.next_payment_date ? new Date(tenant.next_payment_date) : new Date();
            const newNextDate = format(addDays(currentNextDate, -7), 'yyyy-MM-dd');
            await supabase.from('tenants').update({ next_payment_date: newNextDate }).eq('id', tenant.id);
        }

        setDeletingPaymentId(null);
        queryClient.invalidateQueries({ queryKey: ['tenant', id] });
        queryClient.invalidateQueries({ queryKey: ['tenants'] });
    };

    const handleFastPayment = async (e) => {
        if (e) e.stopPropagation();
        if (!tenant) return;

        const toastId = toast.loading('Обработка платежа...');
        const amount = tenant.bikes?.price || 0;
        const currentNextDate = tenant.next_payment_date ? new Date(tenant.next_payment_date) : new Date();
        const newNextDate = format(addDays(currentNextDate, 7), 'yyyy-MM-dd');

        const { error } = await supabase.from('payments').insert([{
            tenant_id: tenant.id,
            amount: amount,
            payment_date: format(new Date(), 'yyyy-MM-dd')
        }]);

        if (!error) {
            await supabase.from('tenants').update({ next_payment_date: newNextDate }).eq('id', tenant.id);
            toast.success(`Оплачено ${amount} zł. Следующий платеж: ${format(new Date(newNextDate), 'dd.MM.yyyy')}`, { id: toastId });
            queryClient.invalidateQueries({ queryKey: ['tenant', id] });
            queryClient.invalidateQueries({ queryKey: ['tenants'] });
        } else {
            toast.error(error.message, { id: toastId });
        }
    };

    const handleUpdateTenant = async (e) => {
        e.preventDefault();
        const { error } = await supabase
            .from('tenants')
            .update({
                name: editForm.name,
                slug: editForm.slug.toLowerCase().trim().replace(/[^a-z0-9-]/g, '-'),
                bike_id: editForm.bike_id || null,
                next_payment_date: editForm.next_payment_date || null,
                deposit: Number(editForm.deposit) || 0,
                admin_comment: editForm.admin_comment
            })
            .eq('id', id);

        if (!error) {
            if (tenant.bikes?.id !== editForm.bike_id) {
                if (tenant.bikes?.id) {
                    await supabase.from('bikes').update({ status: 'available' }).eq('id', tenant.bikes.id);
                    // Также очищаем связь у любых арендаторов (на случай если была задвоена связь)
                    await supabase.from('tenants').update({ bike_id: null }).eq('bike_id', tenant.bikes.id);
                }
                if (editForm.bike_id) {
                    await supabase.from('bikes').update({ status: 'in_rent' }).eq('id', editForm.bike_id);
                }
            }
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
        await supabase.from('payments').delete().eq('tenant_id', id);

        if (!error) {
            queryClient.invalidateQueries({ queryKey: ['tenants'] });
            navigate('/admin');
        } else {
            alert(error.message);
        }
    };

    if (loading) return <div className="text-gray-600 dark:text-gray-300 p-8">Загрузка...</div>;
    if (!tenant || !editForm) return <div className="text-red-400 p-8">Арендатор не найден</div>;

    const { totalDebt, paidTotal, nextPaymentDate, isOverdue, expectedAmount } = calculateDebt(tenant, tenant.payments);

    const sortedBikes = bikes
        .filter(b => b.status === 'available' || b.status === 'maintenance' || b.id === tenant.bikes?.id)
        .sort((a, b) => {
            if (a.status === 'available' && b.status !== 'available') return -1;
            if (a.status !== 'available' && b.status === 'available') return 1;
            return 0;
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
                                <span className="font-semibold text-gray-900 dark:text-white text-lg">{tenant.bikes?.price || 0}&nbsp;zł</span>
                            </div>
                            <div className="bg-gray-100 dark:bg-gray-700/50 p-3 rounded-lg border border-gray-200 dark:border-gray-700">
                                <span className="block text-gray-400 dark:text-gray-500 mb-1">Депозит:</span>
                                <span className="font-semibold text-gray-900 dark:text-white text-lg">{tenant.deposit || 0}&nbsp;zł</span>
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
                                <select
                                    value={editForm.bike_id}
                                    onChange={(e) => setEditForm({ ...editForm, bike_id: e.target.value })}
                                    className="mt-1 block w-full rounded-md bg-gray-200 dark:bg-gray-700 border border-gray-400 dark:border-gray-600 text-gray-900 dark:text-white py-2 px-3 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 sm:text-sm"
                                >
                                    <option value="">Выберите велосипед</option>
                                    {sortedBikes.map(b => (
                                        <option key={b.id} value={b.id}>
                                            {b.status === 'available' ? '🟢✅ ' : (b.status === 'maintenance' ? '🟠🔧 ' : '🔴🚲 ')}{b.model} - {b.price} zł
                                        </option>
                                    ))}
                                </select>
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-gray-600 dark:text-gray-300">Псевдоним ссылки</label>
                                <div className="mt-1 flex rounded-md shadow-sm">
                                    <span className="inline-flex items-center rounded-l-md border border-r-0 border-gray-400 dark:border-gray-600 bg-gray-200 dark:bg-gray-700 px-3 text-gray-500 dark:text-gray-400 sm:text-sm">/</span>
                                    <input type="text" value={editForm.slug} onChange={e => setEditForm({ ...editForm, slug: e.target.value })} className="block w-full min-w-0 flex-1 rounded-none rounded-r-md bg-gray-200 dark:bg-gray-700 border border-gray-400 dark:border-gray-600 text-gray-900 dark:text-white py-2 px-3 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 sm:text-sm" />
                                </div>
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-gray-600 dark:text-gray-300">Дата след. платежа</label>
                                <input type="date" value={editForm.next_payment_date || ''} onChange={e => setEditForm({ ...editForm, next_payment_date: e.target.value })} className="mt-1 block w-full rounded-md bg-gray-200 dark:bg-gray-700 border border-gray-400 dark:border-gray-600 text-gray-900 dark:text-white py-2 px-3 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 sm:text-sm" style={{ colorScheme: 'dark' }} />
                                <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">Ожидаемая дата следующей оплаты</p>
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-gray-600 dark:text-gray-300">Депозит (zł)</label>
                                <input type="number" value={editForm.deposit || ''} onChange={e => setEditForm({ ...editForm, deposit: e.target.value })} className="mt-1 block w-full rounded-md bg-gray-200 dark:bg-gray-700 border border-gray-400 dark:border-gray-600 text-gray-900 dark:text-white py-2 px-3 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 sm:text-sm" />
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
                <div className="bg-white dark:bg-gray-800 rounded-xl shadow border border-gray-200 dark:border-gray-700 p-4 sm:p-6">
                    <h3 className="text-lg font-medium text-gray-900 dark:text-white mb-4 flex items-center">
                        <DollarSign className="w-5 h-5 mr-2 text-indigo-400" /> Сводка
                    </h3>
                    <dl className="space-y-4">
                        <div className="flex justify-between border-b border-gray-200 dark:border-gray-700 pb-3">
                            <dt className="text-gray-500 dark:text-gray-400 text-sm">Ожидаемая сумма к оплате</dt>
                            <dd className="font-medium text-gray-900 dark:text-white">{expectedAmount}&nbsp;zł</dd>
                        </div>
                        <div className="flex justify-between border-b border-gray-200 dark:border-gray-700 pb-3">
                            <dt className="text-gray-500 dark:text-gray-400 text-sm">Фактически оплачено</dt>
                            <dd className="font-medium text-green-400">{paidTotal}&nbsp;zł</dd>
                        </div>
                        <div className="flex justify-between pt-2">
                            <dt className="text-gray-700 dark:text-gray-200 font-medium">Текущий баланс</dt>
                            <dd className={`font-bold text-lg ${totalDebt > 0 ? 'text-red-400' : 'text-green-400'}`}>
                                {totalDebt > 0 ? `Долг ${totalDebt}\u00A0zł` : '0\u00A0zł'}
                            </dd>
                        </div>
                    </dl>
                </div>

                <div className="bg-white dark:bg-gray-800 rounded-xl shadow border border-gray-200 dark:border-gray-700 p-4 sm:p-6">
                    <div className="flex items-center justify-between mb-4">
                        <h3 className="text-lg font-medium text-gray-900 dark:text-white flex items-center">
                            <Calendar className="w-5 h-5 mr-2 text-indigo-400" /> Платежи
                        </h3>
                        <div className="flex gap-2 relative">
                            <button title="Оплачено" onClick={(e) => handleFastPayment(e)} className="flex items-center bg-indigo-600 hover:bg-indigo-700 text-white p-2 rounded-md transition-colors shadow-sm">
                                <CheckCircle className="w-4 h-4" />
                            </button>
                            <button title="Добавить платеж" onClick={() => { setEditingPayment(null); setIsPaymentModalOpen(true); }} className="flex items-center bg-gray-200/50 dark:bg-gray-700/50 hover:bg-gray-200 dark:bg-gray-700 border border-gray-400 dark:border-gray-600 text-gray-600 dark:text-gray-300 hover:text-gray-900 dark:text-white p-2 rounded-md transition-colors">
                                <Plus className="w-4 h-4" />
                            </button>
                        </div>
                    </div>
                    <div className="flow-root mt-6">
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
                                                    <button onClick={() => setDeletingPaymentId(payment.id)} className="text-red-400 hover:text-gray-900 dark:text-white hover:bg-red-500 transition-colors p-1.5 rounded bg-red-900/20 border border-red-500/20">
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
                    </div>
                </div>
            </div>

            {/* Delete Confirmation Modal */}
            {deletingPaymentId && (
                <div className="fixed inset-0 z-50">
                    <div className="fixed inset-0 bg-gray-900/80 backdrop-blur-sm" onClick={(e) => { e.stopPropagation(); setDeletingPaymentId(null); }} />
                    <div className="fixed inset-0 z-10 flex items-center justify-center p-4 pointer-events-none">
                        <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl max-w-sm w-full p-6 shadow-2xl relative pointer-events-auto">
                            <button onClick={() => setDeletingPaymentId(null)} className="absolute top-4 right-4 text-gray-500 dark:text-gray-400 hover:text-gray-900 dark:text-white transition-colors bg-gray-200/50 dark:bg-gray-700/50 hover:bg-gray-200 dark:bg-gray-700 p-1 rounded-md">
                                <X className="w-5 h-5" />
                            </button>
                            <div className="flex items-center text-red-400 mb-4 pr-6">
                                <AlertCircle className="w-6 h-6 mr-2" />
                                <h3 className="text-lg font-bold text-gray-900 dark:text-white">Удалить платеж?</h3>
                            </div>
                            <p className="text-gray-600 dark:text-gray-300 text-sm mb-6">Эта операция удалит платеж из истории. Баланс арендатора будет пересчитан. Отменить действие будет невозможно.</p>
                            <div className="flex justify-end space-x-3">
                                <button onClick={() => setDeletingPaymentId(null)} className="px-4 py-2 bg-gray-200 dark:bg-gray-700 hover:bg-gray-600 text-gray-700 dark:text-gray-200 text-sm font-medium rounded-md transition-colors">Отмена</button>
                                <button onClick={confirmDeletePayment} className="px-4 py-2 bg-red-600 hover:bg-red-500 text-gray-900 dark:text-white text-sm font-medium rounded-md transition-colors">Удалить</button>
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

function PaymentModalForm({ tenant, payment, onClose, onSuccess }) {
    const isEdit = !!payment;
    const [amount, setAmount] = useState(payment?.amount || tenant?.bikes?.price || '');
    const [paymentDate, setPaymentDate] = useState(payment?.payment_date ? format(new Date(payment.payment_date), 'yyyy-MM-dd') : format(new Date(), 'yyyy-MM-dd'));
    const [loading, setLoading] = useState(false);

    const handleSubmit = async (e) => {
        e.preventDefault();
        setLoading(true);

        const payload = {
            tenant_id: tenant.id,
            amount: Number(amount),
            payment_date: paymentDate
        };

        let response;
        if (isEdit && payment.isExpected) {
            response = await supabase.from('tenants').update({
                next_payment_date: paymentDate,
                next_payment_amount: Number(amount)
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
            response = await supabase.from('payments').insert([payload]);
            if (!response.error) {
                // Продляем
                const currentNextDate = tenant.next_payment_date ? new Date(tenant.next_payment_date) : new Date();
                const newNextDate = format(addDays(currentNextDate, 7), 'yyyy-MM-dd');
                await supabase.from('tenants').update({ next_payment_date: newNextDate }).eq('id', tenant.id);
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
