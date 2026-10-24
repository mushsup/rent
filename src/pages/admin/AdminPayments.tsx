import { useState, type FormEvent, type MouseEvent } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Plus, Landmark, Trash2, Edit2, ChevronLeft } from 'lucide-react';
import toast from 'react-hot-toast';
import TrendChart from '../../components/TrendChart';
import { deleteCredit, deleteCreditTransaction, fetchCredits as loadCredits, saveCredit, saveCreditTransaction } from '../../features/credits/api';
import { generateCreditSchedule } from '../../features/credits/schedule';
import type { Credit, CreditTransaction, CreditTransactionType } from '../../types';
import { ConfirmDialog, EmptyState, ErrorState, LoadingState } from '../../shared/ui';
import { queryKeys } from '../../shared/lib/queryKeys';
import { getErrorMessage } from '../../shared/lib/errors';
import { formatEur } from '../../shared/lib/money';
import { formatDate } from '../../shared/lib/format';
import { format } from 'date-fns';
import { CreditModal, TransactionModal, type CreditFormData, type TransactionFormData } from './CreditModals';
import { buildCreditDebtChartData, getCreditDebt, getTotalCreditDebt } from './creditSelectors';
import { useI18n } from '../../i18n';

export default function AdminPayments() {
    const queryClient = useQueryClient();
    const { t } = useI18n();
    const { data, isLoading: loading, isError } = useQuery<{ credits: Credit[]; transactions: CreditTransaction[] }>({
        queryKey: queryKeys.credits.all,
        queryFn: loadCredits
    });
    const credits = data?.credits || [];
    const creditTransactions = data?.transactions || [];

    const [isModalOpen, setIsModalOpen] = useState(false);
    const [editingCredit, setEditingCredit] = useState<Credit | null>(null);
    const [selectedCredit, setSelectedCredit] = useState<Credit | null>(null);
    const [isTransactionModalOpen, setIsTransactionModalOpen] = useState(false);
    const [editingTransaction, setEditingTransaction] = useState<CreditTransaction | null>(null);
    const [pendingDelete, setPendingDelete] = useState<{ type: 'credit' | 'transaction'; id: string } | null>(null);
    const [savingCredit, setSavingCredit] = useState(false);
    const [savingTransaction, setSavingTransaction] = useState(false);
    const [deleting, setDeleting] = useState(false);
    const [transactionType, setTransactionType] = useState<CreditTransactionType>('payment');
    const [transactionData, setTransactionData] = useState<TransactionFormData>({
        amount: '',
        date: format(new Date(), 'yyyy-MM-dd')
    });

    const [formData, setFormData] = useState<CreditFormData>({
        name: '',
        start_date: new Date().toISOString().split('T')[0],
        type: 'no_interest',
        amount: '',
        interest_rate: ''
    });

    const refreshCredits = () => queryClient.invalidateQueries({ queryKey: queryKeys.credits.all });

    const openCreateModal = () => {
        setEditingCredit(null);
        setFormData({
            name: '', start_date: format(new Date(), 'yyyy-MM-dd'), type: 'no_interest',
            amount: '', interest_rate: ''
        });
        setIsModalOpen(true);
    };

    const openEditModal = (e: MouseEvent<HTMLButtonElement>, credit: Credit) => {
        e.stopPropagation();
        setEditingCredit(credit);
        setFormData({
            name: credit.name,
            start_date: credit.start_date,
            type: credit.type,
            amount: String(credit.amount),
            interest_rate: credit.interest_rate == null ? '' : String(credit.interest_rate)
        });
        setIsModalOpen(true);
    };

    const handleSaveCredit = async (e: FormEvent<HTMLFormElement>) => {
        e.preventDefault();
        if (savingCredit) return;
        const payload = {
            name: formData.name,
            start_date: formData.start_date,
            type: formData.type,
            amount: parseFloat(formData.amount),
            interest_rate: formData.type === 'interest' ? parseFloat(String(formData.interest_rate || 0)) : 0,
            payment_day: editingCredit?.payment_day || 1,
            payment_amount: editingCredit?.payment_amount || 0
        };

        setSavingCredit(true);
        try {
            await saveCredit(editingCredit?.id, payload);
            toast.success(t(editingCredit ? 'Кредит обновлен' : 'Кредит успешно добавлен'));
            setIsModalOpen(false);
            refreshCredits();
        } catch (error) {
            toast.error(`${t('Ошибка сохранения')}: ${t(getErrorMessage(error))}`);
        } finally {
            setSavingCredit(false);
        }
    };

    const handleDelete = (e: MouseEvent<HTMLButtonElement>, id: string) => {
        e.stopPropagation();
        setPendingDelete({ type: 'credit', id });
    };

    const confirmDelete = async () => {
        if (!pendingDelete || deleting) return;
        setDeleting(true);
        try {
            if (pendingDelete.type === 'credit') {
                await deleteCredit(pendingDelete.id);
                toast.success(t('Кредит удален'));
                if (selectedCredit?.id === pendingDelete.id) setSelectedCredit(null);
            } else {
                await deleteCreditTransaction(pendingDelete.id);
                toast.success(t('Операция удалена'));
            }
            refreshCredits();
            setPendingDelete(null);
        } catch (error) {
            toast.error(`${t('Ошибка удаления')}: ${t(getErrorMessage(error))}`);
        } finally {
            setDeleting(false);
        }
    };

    const handleAddTransaction = async (e: FormEvent<HTMLFormElement>) => {
        e.preventDefault();
        if (!selectedCredit || savingTransaction) return;
        const payload = {
            credit_id: selectedCredit.id,
            type: transactionType,
            amount: parseFloat(transactionData.amount),
            transaction_date: transactionData.date
        };

        setSavingTransaction(true);
        try {
            await saveCreditTransaction(editingTransaction?.id, payload);
            toast.success(t(editingTransaction ? 'Операция обновлена' : transactionType === 'payment' ? 'Платеж добавлен' : 'Сумма кредита увеличена'));
            setIsTransactionModalOpen(false);
            setEditingTransaction(null);
            setTransactionData({ amount: '', date: format(new Date(), 'yyyy-MM-dd') });
            refreshCredits();
        } catch (error) {
            toast.error(`${t('Ошибка операции')}: ${t(getErrorMessage(error))}`);
        } finally {
            setSavingTransaction(false);
        }
    };

    const handleDeleteTransaction = (id: string) => {
        setPendingDelete({ type: 'transaction', id });
    };

    if (loading) return <LoadingState label={t('Загрузка кредитов…')} />;
    if (isError) return <ErrorState message={t('Не удалось загрузить кредиты.')} retry={() => { void queryClient.invalidateQueries({ queryKey: queryKeys.credits.all }); }} />;

    const referenceDate = new Date();
    const totalDebt = getTotalCreditDebt(credits, creditTransactions, referenceDate);
    const totalGraphData = buildCreditDebtChartData(credits, creditTransactions, referenceDate);
    const selectedSchedule = selectedCredit ? generateCreditSchedule(selectedCredit, creditTransactions) : [];

    const openEditTransaction = (tx: CreditTransaction | undefined) => {
        if (!tx) return;
        setEditingTransaction(tx);
        setTransactionType(tx.type);
        setTransactionData({
            amount: tx.amount.toString(),
            date: tx.transaction_date
        });
        setIsTransactionModalOpen(true);
    };

    return (
        <div className="space-y-6">
            {!selectedCredit ? (
                <>
                    <div className="bg-white dark:bg-slate-900 rounded-lg border border-slate-200 dark:border-slate-800 overflow-hidden shadow-sm text-center relative flex flex-col p-6">
                        <div className="relative z-10">
                            <div className="inline-flex w-14 h-14 rounded-full bg-lime-600 items-center justify-center mb-3 text-slate-950 shadow-sm">
                                <Landmark className="w-7 h-7" />
                            </div>
                            <h2 className="text-slate-500 dark:text-slate-400 text-xs font-bold uppercase tracking-wider mb-2">{t('Общая сумма')}</h2>
                            <div className="text-5xl font-bold tabular-nums text-slate-950 dark:text-white flex items-center justify-center gap-2">
                                <span className="text-3xl text-slate-400">€</span>
                                {totalDebt.toLocaleString('ru-RU', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                            </div>
                        </div>

                        {totalGraphData.length > 0 && (
                            <div className="w-full h-[250px] mt-6 relative z-0" style={{ outline: 'none' }}>
                                <TrendChart
                                    data={totalGraphData.map((point) => ({ label: point.label, value: point.debtAmount, detail: `${point.label}: ${formatEur(point.debtAmount)}` }))}
                                    valueFormatter={(value) => formatEur(value)}
                                    ariaLabel={t('График общей суммы долга')}
                                />
                            </div>
                        )}
                    </div>

                    <div className="flex justify-between items-center px-1">
                        <h1 className="text-2xl font-bold text-slate-950 dark:text-white">{t('Кредиты')}</h1>
                        <button onClick={openCreateModal} className="flex items-center px-4 py-2 bg-lime-600 hover:bg-lime-700 text-slate-950 rounded-lg shadow-sm transition-colors font-semibold">
                            <Plus className="w-5 h-5 mr-2" /> {t('Добавить')}
                        </button>
                    </div>

                    <div className="bg-white dark:bg-slate-900 rounded-lg border border-slate-200 dark:border-slate-800 overflow-hidden shadow-sm">
                        {credits.length === 0 ? (
                            <EmptyState title={t('Нет активных кредитов')} action={<button type="button" onClick={openCreateModal} className="rounded-md bg-lime-500 px-4 py-2 text-sm font-semibold text-slate-950 hover:bg-lime-400">{t('Добавить кредит')}</button>} />
                        ) : (
                            <ul className="divide-y divide-slate-100 dark:divide-slate-700">
                                {credits.map((credit) => {
                                    const currentDebt = getCreditDebt(credit, creditTransactions, referenceDate);
                                    return (
                                        <li key={credit.id} onClick={() => setSelectedCredit(credit)} className="p-6 flex flex-col sm:flex-row justify-between items-start sm:items-center hover:bg-black/5 dark:hover:bg-white/10 transition-colors cursor-pointer group">
                                            <div className="mb-4 sm:mb-0">
                                                <h3 className="text-lg font-bold text-slate-950 dark:text-white flex items-center gap-3">
                                                    <div className="p-2 bg-lime-600 text-slate-950 rounded-full shadow-sm group-hover:bg-lime-700 transition-colors">
                                                        <Landmark className="w-4 h-4" />
                                                    </div>
                                                    {credit.name}
                                                </h3>
                                                <div className="text-sm text-slate-500 mt-2 space-x-3 ml-11">
                                                    <span>{t('Взят:')} {formatDate(credit.start_date)}</span>
                                                    <span>{t('Остаток:')} <span className="text-slate-950 dark:text-white font-semibold">{formatEur(currentDebt)}</span></span>
                                                </div>
                                            </div>
                                            <div className="flex gap-2">
                                                <button type="button" aria-label={t('Редактировать кредит')} title={t('Редактировать кредит')} onClick={(e) => openEditModal(e, credit)} className="min-h-10 min-w-10 p-2 text-slate-500 dark:text-slate-400 hover:text-lime-800 dark:hover:text-lime-400 hover:bg-slate-200 dark:hover:bg-slate-700 rounded-lg transition-colors">
                                                    <Edit2 className="w-4 h-4" />
                                                </button>
                                                <button type="button" aria-label={t('Удалить кредит')} title={t('Удалить кредит')} onClick={(e) => handleDelete(e, credit.id)} className="min-h-10 min-w-10 p-2 text-slate-500 dark:text-slate-400 hover:text-red-600 dark:hover:text-red-400 hover:bg-slate-200 dark:hover:bg-slate-700 rounded-lg transition-colors">
                                                    <Trash2 className="w-4 h-4" />
                                                </button>
                                            </div>
                                        </li>
                                    );
                                })}
                            </ul>
                        )}
                    </div>
                </>
            ) : (
                <div className="space-y-6">
                    <button onClick={() => setSelectedCredit(null)} className="flex items-center text-slate-500 dark:text-slate-400 hover:text-slate-950 dark:hover:text-white hover:bg-black/5 dark:hover:bg-white/10 px-2 py-1 rounded-md transition-colors mb-4 font-medium">
                        <ChevronLeft className="w-5 h-5 mr-1" /> {t('Назад к списку')}
                    </button>

                    <div className="bg-white dark:bg-slate-900 rounded-lg border border-slate-200 dark:border-slate-800 p-8 shadow-sm">
                        <h2 className="text-2xl font-bold text-slate-950 dark:text-white mb-6 flex items-center justify-between border-b border-slate-200 dark:border-slate-800 pb-4">
                            <div className="flex items-center">
                                <Landmark className="w-6 h-6 mr-3 text-lime-400" />
                                {selectedCredit.name}
                            </div>
                            <div className="flex gap-3">
                                <button
                                    onClick={() => { setEditingTransaction(null); setTransactionType('addition'); setTransactionData({ amount: '', date: new Date().toISOString().split('T')[0] }); setIsTransactionModalOpen(true); }}
                                    className="flex items-center px-4 py-2 bg-slate-200 hover:bg-slate-300 text-slate-800 dark:bg-slate-700 dark:text-slate-200 dark:hover:bg-slate-600 text-sm font-bold rounded-lg transition-colors shadow-sm"
                                >
                                    <Plus className="w-4 h-4 mr-1.5" /> {t('Взять еще')}
                                </button>
                                <button
                                    onClick={() => { setEditingTransaction(null); setTransactionType('payment'); setTransactionData({ amount: '', date: new Date().toISOString().split('T')[0] }); setIsTransactionModalOpen(true); }}
                                    className="flex items-center px-4 py-2 bg-lime-500 hover:bg-lime-400 text-slate-950 text-sm font-bold rounded-lg transition-colors shadow-sm"
                                >
                                    <Plus className="w-4 h-4 mr-1.5" /> {t('Оплатить')}
                                </button>
                            </div>
                        </h2>

                        <div className="h-[250px] min-h-[250px] focus:outline-none mb-8" style={{ outline: 'none' }}>
                                <TrendChart
                                    data={[...selectedSchedule].reverse().map((schedule) => ({ label: schedule.graphLabel, value: schedule.amount, detail: `${schedule.graphLabel}: ${formatEur(schedule.amount)}` }))}
                                    accent="#f97316"
                                    valueFormatter={(value) => formatEur(value)}
                                    ariaLabel={t('График текущего долга')}
                                />
                        </div>

                        <h3 className="text-xl font-bold text-slate-950 dark:text-white mb-4">{t('История операций')}</h3>
                        <div className="overflow-x-auto max-w-full bg-white dark:bg-slate-900 rounded-lg border border-slate-200 dark:border-slate-800">
                            <table className="min-w-[640px] w-full divide-y divide-slate-200 dark:divide-slate-700">
                                <thead className="bg-slate-50 dark:bg-slate-800/80 sticky top-0">
                                    <tr>
                                        <th className="px-4 py-4 text-left text-xs font-semibold text-slate-500 dark:text-slate-300 uppercase tracking-wide">{t('Дата')}</th>
                                        <th className="px-4 py-4 text-left text-xs font-semibold text-slate-500 dark:text-slate-300 uppercase tracking-wide">{t('Действие')}</th>
                                        <th className="px-4 py-4 text-right text-xs font-semibold text-slate-500 dark:text-slate-300 uppercase tracking-wide">{t('Остаток (€)')}</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-100 dark:divide-slate-700">
                                    {selectedSchedule.map((s, i) => (
                                        <tr key={i} className="transition-colors hover:bg-black/5 dark:hover:bg-white/10 group">
                                            <td className="whitespace-nowrap px-4 py-4 text-sm text-slate-500 dark:text-slate-400">{s.date}</td>
                                            <td className="whitespace-nowrap px-4 py-4 text-sm text-slate-600 dark:text-slate-300">
                                                {t(s.action)}
                                            </td>
                                            <td className="whitespace-nowrap px-4 py-4 text-sm font-bold text-slate-900 dark:text-white text-right">
                                                <div className="flex items-center justify-end gap-2 text-right">
                                                    {formatEur(s.amount)}
                                                    {s.txId && (
                                                        <div className="flex gap-1 opacity-100 lg:opacity-0 lg:group-hover:opacity-100 lg:focus-within:opacity-100 transition-opacity">
                                                            <button type="button" aria-label={t('Редактировать операцию')} title={t('Редактировать операцию')} onClick={() => openEditTransaction(creditTransactions.find(t => t.id === s.txId))} className="min-h-10 min-w-10 p-2 hover:text-lime-800 dark:hover:text-lime-400 transition-colors">
                                                                <Edit2 className="w-3.5 h-3.5" />
                                                            </button>
                                                            <button type="button" aria-label={t('Удалить операцию')} title={t('Удалить операцию')} onClick={() => s.txId && handleDeleteTransaction(s.txId)} className="min-h-10 min-w-10 p-2 hover:text-red-600 dark:hover:text-red-400 transition-colors">
                                                                <Trash2 className="w-3.5 h-3.5" />
                                                            </button>
                                                        </div>
                                                    )}
                                                </div>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </div>
                </div>
            )}

            {isModalOpen && <CreditModal credit={editingCredit} formData={formData} setFormData={setFormData} onClose={() => { if (!savingCredit) setIsModalOpen(false); }} onSubmit={handleSaveCredit} busy={savingCredit} />}
            {isTransactionModalOpen && <TransactionModal transaction={editingTransaction} transactionType={transactionType} transactionData={transactionData} setTransactionData={setTransactionData} onClose={() => { if (!savingTransaction) { setIsTransactionModalOpen(false); setEditingTransaction(null); } }} onSubmit={handleAddTransaction} busy={savingTransaction} />}
            <ConfirmDialog open={Boolean(pendingDelete)} title={t(pendingDelete?.type === 'credit' ? 'Удалить кредит?' : 'Удалить операцию?')} description={t(pendingDelete?.type === 'credit' ? 'Кредит и связанные операции будут удалены без возможности восстановления.' : 'Операция будет удалена из журнала.')} onCancel={() => { if (!deleting) setPendingDelete(null); }} onConfirm={confirmDelete} busy={deleting} />
        </div>
    );
}
