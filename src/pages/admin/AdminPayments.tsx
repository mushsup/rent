import { useState, useEffect } from 'react';
import { calculateCreditDebt } from '../../utils/calculateCreditDebt';
import { Plus, X, Landmark, Trash2, Edit2, ChevronLeft } from 'lucide-react';
import toast from 'react-hot-toast';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { format, addMonths } from 'date-fns';
import { ru } from 'date-fns/locale';
import { deleteCredit, deleteCreditTransaction, fetchCredits as loadCredits, saveCredit, saveCreditTransaction } from '../../features/credits/api';
import { generateCreditSchedule } from '../../features/credits/schedule';
import type { Credit, CreditTransaction } from '../../types';

export default function AdminPayments() {
    const [credits, setCredits] = useState<Credit[]>([]);
    const [loading, setLoading] = useState(true);

    const [isModalOpen, setIsModalOpen] = useState(false);
    const [editingCredit, setEditingCredit] = useState<Credit | null>(null);
    const [selectedCredit, setSelectedCredit] = useState<Credit | null>(null);
    const [creditTransactions, setCreditTransactions] = useState<CreditTransaction[]>([]);
    const [isTransactionModalOpen, setIsTransactionModalOpen] = useState(false);
    const [editingTransaction, setEditingTransaction] = useState<CreditTransaction | null>(null);
    const [transactionType, setTransactionType] = useState('payment'); // 'payment' or 'addition'
    const [transactionData, setTransactionData] = useState({
        amount: '',
        date: new Date().toISOString().split('T')[0]
    });

    const [formData, setFormData] = useState({
        name: '',
        start_date: new Date().toISOString().split('T')[0],
        type: 'no_interest',
        amount: '',
        interest_rate: '',
        payment_day: '1',
        payment_amount: ''
    });

    useEffect(() => {
        fetchCredits();
    }, []);

    const fetchCredits = async () => {
        try {
            const data = await loadCredits();
            setCredits(data.credits);
            setCreditTransactions(data.transactions);
        } catch (error) {
            toast.error(error.message);
        } finally {
            setLoading(false);
        }
    };

    const openCreateModal = () => {
        setEditingCredit(null);
        setFormData({
            name: '', start_date: new Date().toISOString().split('T')[0], type: 'no_interest',
            amount: '', interest_rate: '', payment_day: '1', payment_amount: ''
        });
        setIsModalOpen(true);
    };

    const openEditModal = (e, credit) => {
        e.stopPropagation();
        setEditingCredit(credit);
        setFormData({
            name: credit.name,
            start_date: credit.start_date,
            type: credit.type,
            amount: credit.amount,
            interest_rate: credit.interest_rate || '',
            payment_day: credit.payment_day,
            payment_amount: credit.payment_amount
        });
        setIsModalOpen(true);
    };

    const handleSaveCredit = async (e) => {
        e.preventDefault();
        const payload = {
            name: formData.name,
            start_date: formData.start_date,
            type: formData.type,
            amount: parseFloat(formData.amount),
            interest_rate: formData.type === 'interest' ? parseFloat(String(formData.interest_rate || 0)) : 0,
            payment_day: parseInt(formData.payment_day) || 1,
            payment_amount: parseFloat(formData.payment_amount) || 0
        };

        try {
            await saveCredit(editingCredit?.id, payload);
            toast.success(editingCredit ? 'Кредит обновлен' : 'Кредит успешно добавлен');
            setIsModalOpen(false);
            fetchCredits();
        } catch (error) {
            toast.error(`Ошибка сохранения: ${error.message}`);
        }
    };

    const handleDelete = async (e, id) => {
        e.stopPropagation();
        if (!window.confirm('Точно удалить этот кредит?')) return;
        try {
            await deleteCredit(id);
            toast.success('Кредит удален');
            fetchCredits();
            if (selectedCredit?.id === id) setSelectedCredit(null);
        } catch (error) {
            toast.error(`Ошибка удаления: ${error.message}`);
        }
    };

    const handleAddTransaction = async (e) => {
        e.preventDefault();
        const payload = {
            credit_id: selectedCredit.id,
            type: transactionType,
            amount: parseFloat(transactionData.amount),
            transaction_date: transactionData.date
        };

        try {
            await saveCreditTransaction(editingTransaction?.id, payload);
            toast.success(editingTransaction ? 'Операция обновлена' : transactionType === 'payment' ? 'Платеж добавлен' : 'Сумма кредита увеличена');
            setIsTransactionModalOpen(false);
            setEditingTransaction(null);
            setTransactionData({ amount: '', date: new Date().toISOString().split('T')[0] });
            fetchCredits();
        } catch (error) {
            toast.error(`Ошибка операции: ${error.message}`);
        }
    };

    const handleDeleteTransaction = async (id) => {
        if (!window.confirm('Удалить эту операцию?')) return;
        try {
            await deleteCreditTransaction(id);
            toast.success('Операция удалена');
            fetchCredits();
        } catch (error) {
            toast.error(`Ошибка удаления: ${error.message}`);
        }
    };

    const processTotalDebtChartData = () => {
        if (!credits || credits.length === 0) return [];

        const earliestDateSrc = credits.reduce((min, c) => (c.start_date < min ? c.start_date : min), credits[0].start_date);
        const startDate = new Date(earliestDateSrc);
        const now = new Date();

        let data = [];
        let current = new Date(startDate);
        current.setDate(1);

        while (current <= now) {
            const dStr = format(current, 'yyyy-MM-dd');
            const label = format(current, 'MMM yyyy', { locale: ru });
            const val = credits.reduce((sum, c) => sum + calculateCreditDebt(c, current, creditTransactions.filter(tx => tx.credit_id === c.id)), 0);
            data.push({ date: dStr, label, debtAmount: val });
            current = addMonths(current, 1);
        }

        const endLast = data.length > 0 ? data[data.length - 1] : null;
        if (!endLast || endLast.date.substring(0, 7) !== format(now, 'yyyy-MM')) {
             data.push({
                 date: format(now, 'yyyy-MM-dd'),
                 label: format(now, 'MMM yyyy', { locale: ru }),
                 debtAmount: credits.reduce((sum, c) => sum + calculateCreditDebt(c, now, creditTransactions.filter(tx => tx.credit_id === c.id)), 0)
             });
        }
        return data;
    };

    if (loading) return <div className="text-slate-900 dark:text-white text-center">Загрузка...</div>;

    const totalDebt = credits.reduce((sum, c) => sum + calculateCreditDebt(c, new Date(), creditTransactions.filter(tx => tx.credit_id === c.id)), 0);
    const totalGraphData = processTotalDebtChartData();
    const selectedSchedule = selectedCredit ? generateCreditSchedule(selectedCredit, creditTransactions) : [];

    const openEditTransaction = (tx) => {
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
                            <div className="inline-flex w-14 h-14 rounded-full bg-lime-600 items-center justify-center mb-3 text-white shadow-sm">
                                <Landmark className="w-7 h-7" />
                            </div>
                            <h2 className="text-slate-500 dark:text-slate-400 text-xs font-bold uppercase tracking-wider mb-2">Общая сумма</h2>
                            <div className="text-5xl font-extrabold text-black dark:text-white flex items-center justify-center gap-2">
                                <span className="text-3xl text-slate-400">€</span>
                                {totalDebt.toLocaleString('ru-RU', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                            </div>
                        </div>

                        {totalGraphData.length > 0 && (
                            <div className="w-full h-[250px] mt-6 relative z-0" style={{ outline: 'none' }}>
                                <ResponsiveContainer width="100%" height="100%">
                                    <AreaChart data={totalGraphData} margin={{ top: 10, right: 20, left: 0, bottom: 0 }}>
                                        <defs>
                                            <linearGradient id="colorTotalGraph" x1="0" y1="0" x2="0" y2="1">
                                                <stop offset="5%" stopColor="var(--or-primary)" stopOpacity={0.2} />
                                                <stop offset="95%" stopColor="var(--or-primary)" stopOpacity={0} />
                                            </linearGradient>
                                        </defs>
                                        <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" className="dark:stroke-slate-800" vertical={false} />
                                        <XAxis dataKey="label" stroke="#94a3b8" fontSize={12} tickLine={false} axisLine={false} tickMargin={15} minTickGap={20} />
                                        <YAxis stroke="#94a3b8" fontSize={12} tickLine={false} axisLine={false} tickFormatter={(v) => `${v.toLocaleString('ru-RU')}`} />
                                        <Tooltip cursor={{ stroke: 'var(--or-primary)' }} contentStyle={{ backgroundColor: '#ffffff', borderColor: '#03080a14', borderRadius: '0.5rem', color: '#03080a' }} itemStyle={{ color: 'var(--or-primary)', fontWeight: 'bold' }} formatter={(v) => [`€${v.toLocaleString('ru-RU', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`, 'Сумма долга']} labelFormatter={(label) => label} />
                                        <Area type="monotone" dataKey="debtAmount" stroke="var(--or-primary)" strokeWidth={3} fillOpacity={1} fill="url(#colorTotalGraph)" activeDot={{ r: 5, fill: 'var(--or-primary)', stroke: '#fff', strokeWidth: 2 }} />
                                    </AreaChart>
                                </ResponsiveContainer>
                            </div>
                        )}
                    </div>

                    <div className="flex justify-between items-center px-1">
                        <h1 className="text-2xl font-bold text-black dark:text-white">Кредиты</h1>
                        <button onClick={openCreateModal} className="flex items-center px-4 py-2 bg-lime-600 hover:bg-lime-700 text-white rounded-lg shadow-sm transition-colors font-medium">
                            <Plus className="w-5 h-5 mr-2" /> Добавить
                        </button>
                    </div>

                    <div className="bg-white dark:bg-slate-900 rounded-lg border border-slate-200 dark:border-slate-800 overflow-hidden shadow-sm">
                        {credits.length === 0 ? (
                            <div className="p-8 text-center text-slate-500 dark:text-slate-400">Нет активных кредитов.</div>
                        ) : (
                            <ul className="divide-y divide-slate-100 dark:divide-slate-700">
                                {credits.map((credit) => {
                                    const currentDebt = calculateCreditDebt(credit, new Date(), creditTransactions.filter(tx => tx.credit_id === credit.id));
                                    return (
                                        <li key={credit.id} onClick={() => setSelectedCredit(credit)} className="p-6 flex flex-col sm:flex-row justify-between items-start sm:items-center hover:bg-black/5 dark:hover:bg-white/10 transition-colors cursor-pointer group">
                                            <div className="mb-4 sm:mb-0">
                                                <h3 className="text-lg font-bold text-black dark:text-white flex items-center gap-3">
                                                    <div className="p-2 bg-lime-600 text-white rounded-full shadow-sm group-hover:bg-lime-700 transition-colors">
                                                        <Landmark className="w-4 h-4" />
                                                    </div>
                                                    {credit.name}
                                                </h3>
                                                <div className="text-sm text-slate-500 mt-2 space-x-3 ml-11">
                                                    <span>Взят: {new Date(credit.start_date).toLocaleDateString('ru-RU')}</span>
                                                    <span>Остаток: <span className="text-black dark:text-white font-semibold">€ {currentDebt.toLocaleString('ru-RU', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span></span>
                                                </div>
                                            </div>
                                            <div className="flex gap-2">
                                                <button onClick={(e) => openEditModal(e, credit)} className="p-2 text-slate-500 dark:text-slate-400 hover:text-lime-400 hover:bg-slate-200 dark:hover:bg-slate-700 rounded-lg transition-colors">
                                                    <Edit2 className="w-4 h-4" />
                                                </button>
                                                <button onClick={(e) => handleDelete(e, credit.id)} className="p-2 text-slate-500 dark:text-slate-400 hover:text-red-500 hover:bg-slate-200 dark:hover:bg-slate-700 rounded-lg transition-colors">
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
                    <button onClick={() => setSelectedCredit(null)} className="flex items-center text-slate-500 dark:text-slate-400 hover:text-black dark:hover:text-white hover:bg-black/5 dark:hover:bg-white/10 px-2 py-1 rounded-md transition-colors mb-4 font-medium">
                        <ChevronLeft className="w-5 h-5 mr-1" /> Назад к списку
                    </button>

                    <div className="bg-white dark:bg-slate-900 rounded-lg border border-slate-200 dark:border-slate-800 p-8 shadow-sm">
                        <h2 className="text-2xl font-bold text-black dark:text-white mb-6 flex items-center justify-between border-b border-slate-200 dark:border-slate-800 pb-4">
                            <div className="flex items-center">
                                <Landmark className="w-6 h-6 mr-3 text-lime-400" />
                                {selectedCredit.name}
                            </div>
                            <div className="flex gap-3">
                                <button
                                    onClick={() => { setEditingTransaction(null); setTransactionType('addition'); setTransactionData({ amount: '', date: new Date().toISOString().split('T')[0] }); setIsTransactionModalOpen(true); }}
                                    className="flex items-center px-4 py-2 bg-teal-600 hover:bg-teal-700 text-white text-sm font-bold rounded-lg transition-colors shadow-sm"
                                >
                                    <Plus className="w-4 h-4 mr-1.5" /> Взять еще
                                </button>
                                <button
                                    onClick={() => { setEditingTransaction(null); setTransactionType('payment'); setTransactionData({ amount: '', date: new Date().toISOString().split('T')[0] }); setIsTransactionModalOpen(true); }}
                                    className="flex items-center px-4 py-2 bg-green-600 hover:bg-green-700 text-white text-sm font-bold rounded-lg transition-colors shadow-sm"
                                >
                                    <Plus className="w-4 h-4 mr-1.5" /> Оплатить
                                </button>
                            </div>
                        </h2>

                        <div className="h-[250px] min-h-[250px] focus:outline-none mb-8" style={{ outline: 'none' }}>
                            <ResponsiveContainer width="100%" height="100%">
                                <AreaChart data={[...selectedSchedule].reverse().map(s => ({ label: s.graphLabel, debtAmount: s.amount }))} margin={{ top: 10, right: 0, left: -20, bottom: 0 }}>
                                    <defs>
                                        <linearGradient id="colorCreditGraph" x1="0" y1="0" x2="0" y2="1">
                                            <stop offset="5%" stopColor="#f97316" stopOpacity={0.3} />
                                            <stop offset="95%" stopColor="#f97316" stopOpacity={0} />
                                        </linearGradient>
                                    </defs>
                                    <CartesianGrid strokeDasharray="3 3" stroke="#334155" vertical={false} />
                                    <XAxis dataKey="label" stroke="#94a3b8" fontSize={12} tickLine={false} axisLine={false} tickMargin={10} minTickGap={20} />
                                    <YAxis stroke="#64748b" fontSize={12} tickLine={false} axisLine={false} tickFormatter={(v) => `${v.toLocaleString('ru-RU')} zł`} />
                                    <Tooltip cursor={{ stroke: '#f97316' }} contentStyle={{ backgroundColor: '#0f172a', borderColor: '#334155', borderRadius: '0.625rem', color: '#f8fafc' }} itemStyle={{ color: '#fb923c' }} formatter={(v) => [`${v.toLocaleString('ru-RU', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} zł`, 'Текущий долг']} labelFormatter={(label) => label} />
                                    <Area type="monotone" dataKey="debtAmount" stroke="#f97316" strokeWidth={3} fillOpacity={1} fill="url(#colorCreditGraph)" activeDot={{ r: 5 }} />
                                </AreaChart>
                            </ResponsiveContainer>
                        </div>

                        <h3 className="text-xl font-bold text-black dark:text-white mb-4">История операций</h3>
                        <div className="overflow-x-auto bg-white dark:bg-slate-900 rounded-lg border border-slate-200 dark:border-slate-800">
                            <table className="min-w-full divide-y divide-slate-200 dark:divide-slate-700">
                                <thead className="bg-slate-800/80">
                                    <tr>
                                        <th className="px-6 py-4 text-left text-xs font-semibold text-slate-600 dark:text-slate-300 uppercase tracking-wide">Дата</th>
                                        <th className="px-6 py-4 text-left text-xs font-semibold text-slate-600 dark:text-slate-300 uppercase tracking-wide">Действие</th>
                                        <th className="px-6 py-4 text-right text-xs font-semibold text-slate-600 dark:text-slate-300 uppercase tracking-wide">Остаток (zł)</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-100 dark:divide-slate-700">
                                    {selectedSchedule.map((s, i) => (
                                        <tr key={i} className="transition-colors hover:bg-black/5 dark:hover:bg-white/10 group">
                                            <td className="whitespace-nowrap px-6 py-4 text-sm text-slate-500 dark:text-slate-400">{s.date}</td>
                                            <td className="whitespace-nowrap px-6 py-4 text-sm text-slate-600 dark:text-slate-300">
                                                {s.action}
                                            </td>
                                            <td className="whitespace-nowrap px-6 py-4 text-sm font-bold text-slate-900 dark:text-white text-right">
                                                <div className="flex items-center justify-end gap-2 text-right">
                                                    {s.amount.toLocaleString('ru-RU', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                                    {s.txId && (
                                                        <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                                            <button onClick={() => openEditTransaction(creditTransactions.find(t => t.id === s.txId))} className="p-1 hover:text-lime-400 transition-colors">
                                                                <Edit2 className="w-3.5 h-3.5" />
                                                            </button>
                                                            <button onClick={() => handleDeleteTransaction(s.txId)} className="p-1 hover:text-red-500 transition-colors">
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

            {/* Original Modal */}
            {isModalOpen && (
                <div className="fixed inset-0 bg-slate-900/60 dark:bg-black/70 backdrop-blur-sm flex items-center justify-center p-4 z-50">
                    <div className="bg-white dark:bg-slate-900 rounded-lg shadow-2xl w-full max-w-lg overflow-hidden border border-slate-200 dark:border-slate-800">
                        <div className="px-6 py-4 border-b border-slate-200 dark:border-slate-800 flex justify-between items-center bg-white dark:bg-slate-900/50">
                            <h3 className="text-lg font-bold text-black dark:text-white">{editingCredit ? 'Редактировать кредит' : 'Новый кредит'}</h3>
                            <button onClick={() => setIsModalOpen(false)} className="text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white transition-colors">
                                <X className="w-5 h-5" />
                            </button>
                        </div>
                        <form onSubmit={handleSaveCredit} className="p-6 space-y-4">
                            <div>
                                <label className="block text-sm font-medium text-slate-600 dark:text-slate-300">Название</label>
                                <input type="text" required value={formData.name} onChange={e => setFormData({ ...formData, name: e.target.value })} className="mt-1 block w-full rounded-md bg-white dark:bg-slate-700 border border-slate-200 dark:border-slate-600 text-slate-900 dark:text-white py-2 px-3 focus:outline-none focus:border-lime-500 focus:ring-1 focus:ring-lime-500" placeholder="Например: Кредит на велосипеды" />
                            </div>
                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-sm font-medium text-slate-600 dark:text-slate-300">Начальная сумма (zł)</label>
                                    <input type="number" required min="0" step="0.01" value={formData.amount} onChange={e => setFormData({ ...formData, amount: e.target.value })} className="mt-1 block w-full rounded-md bg-white dark:bg-slate-700 border border-slate-200 dark:border-slate-600 text-slate-900 dark:text-white py-2 px-3 focus:outline-none focus:border-lime-500 focus:ring-1 focus:ring-lime-500" />
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-slate-600 dark:text-slate-300">Дата получения</label>
                                    <input type="date" required value={formData.start_date} onChange={e => setFormData({ ...formData, start_date: e.target.value })} className="mt-1 block w-full rounded-md bg-white dark:bg-slate-700 border border-slate-200 dark:border-slate-600 text-slate-900 dark:text-white py-2 px-3 focus:outline-none focus:border-lime-500 focus:ring-1 focus:ring-lime-500" />
                                </div>
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-slate-600 dark:text-slate-300">Тип кредита</label>
                                <select value={formData.type} onChange={e => setFormData({ ...formData, type: e.target.value })} className="mt-1 block w-full rounded-md bg-white dark:bg-slate-700 border border-slate-200 dark:border-slate-600 text-slate-900 dark:text-white py-2 px-3 focus:outline-none focus:border-lime-500 focus:ring-1 focus:ring-lime-500">
                                    <option value="no_interest">Без процентов</option>
                                    <option value="interest">С процентами</option>
                                </select>
                            </div>
                            {formData.type === 'interest' && (
                                <div>
                                    <label className="block text-sm font-medium text-slate-600 dark:text-slate-300">Процент (годовых, %)</label>
                                    <input type="number" required min="0" step="0.01" value={formData.interest_rate} onChange={e => setFormData({ ...formData, interest_rate: e.target.value })} className="mt-1 block w-full rounded-md bg-white dark:bg-slate-700 border border-slate-200 dark:border-slate-600 text-slate-900 dark:text-white py-2 px-3 focus:outline-none focus:border-lime-500 focus:ring-1 focus:ring-lime-500" placeholder="Например: 10" />
                                </div>
                            )}
                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-sm font-medium text-slate-600 dark:text-slate-300">Сумма регулярного платежа (zł)</label>
                                    <input type="number" required min="0" step="0.01" value={formData.payment_amount} onChange={e => setFormData({ ...formData, payment_amount: e.target.value })} className="mt-1 block w-full rounded-md bg-white dark:bg-slate-700 border border-slate-200 dark:border-slate-600 text-slate-900 dark:text-white py-2 px-3 focus:outline-none focus:border-lime-500 focus:ring-1 focus:ring-lime-500" />
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-slate-600 dark:text-slate-300">День месяца для оплаты</label>
                                    <input type="number" required min="1" max="31" value={formData.payment_day} onChange={e => setFormData({ ...formData, payment_day: e.target.value })} className="mt-1 block w-full rounded-md bg-white dark:bg-slate-700 border border-slate-200 dark:border-slate-600 text-slate-900 dark:text-white py-2 px-3 focus:outline-none focus:border-lime-500 focus:ring-1 focus:ring-lime-500" placeholder="1-31" />
                                </div>
                            </div>
                            <div className="mt-6 flex justify-end gap-3 pt-2">
                                <button type="button" onClick={() => setIsModalOpen(false)} className="px-4 py-2 rounded-lg text-sm font-medium text-slate-800 dark:text-slate-200 bg-slate-200 dark:bg-slate-700 hover:bg-slate-300 dark:hover:bg-slate-600 transition-colors">Отмена</button>
                                <button type="submit" className="px-4 py-2 bg-lime-600 border border-transparent rounded-lg shadow-sm text-sm font-medium text-white hover:bg-lime-700 transition">Сохранить</button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {/* Transaction Modal */}
            {isTransactionModalOpen && (
                <div className="fixed inset-0 bg-slate-900/60 dark:bg-black/70 backdrop-blur-sm flex items-center justify-center p-4 z-50">
                    <div className="bg-white dark:bg-slate-900 rounded-lg shadow-2xl w-full max-w-sm overflow-hidden border border-slate-200 dark:border-slate-800">
                        <div className="px-6 py-4 border-b border-slate-200 dark:border-slate-800 flex justify-between items-center bg-white dark:bg-slate-900/50">
                            <h3 className="text-lg font-bold text-black dark:text-white">
                                {editingTransaction ? 'Редактировать операцию' : (transactionType === 'payment' ? 'Добавить платеж' : 'Добор кредита')}
                            </h3>
                            <button onClick={() => { setIsTransactionModalOpen(false); setEditingTransaction(null); }} className="text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white transition-colors">
                                <X className="w-5 h-5" />
                            </button>
                        </div>
                        <form onSubmit={handleAddTransaction} className="p-6 space-y-4">
                            <div>
                                <label className="block text-sm font-medium text-slate-600 dark:text-slate-300">Сумма (zł)</label>
                                <input type="number" required min="0.01" step="0.0001" value={transactionData.amount} onChange={e => setTransactionData({ ...transactionData, amount: e.target.value })} className="mt-1 block w-full rounded-md bg-white dark:bg-slate-700 border border-slate-200 dark:border-slate-600 text-slate-900 dark:text-white py-2 px-3 focus:outline-none focus:border-lime-500 focus:ring-1 focus:ring-lime-500" />
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-slate-600 dark:text-slate-300">Дата</label>
                                <input type="date" required value={transactionData.date} onChange={e => setTransactionData({ ...transactionData, date: e.target.value })} className="mt-1 block w-full rounded-md bg-white dark:bg-slate-700 border border-slate-200 dark:border-slate-600 text-slate-900 dark:text-white py-2 px-3 focus:outline-none focus:border-lime-500 focus:ring-1 focus:ring-lime-500" />
                            </div>
                            <div className="mt-6 flex justify-end gap-3 pt-2">
                                <button type="button" onClick={() => { setIsTransactionModalOpen(false); setEditingTransaction(null); }} className="px-4 py-2 rounded-lg text-sm font-medium text-slate-800 dark:text-slate-200 bg-slate-200 dark:bg-slate-700 hover:bg-slate-300 dark:hover:bg-slate-600 transition-colors">Отмена</button>
                                <button type="submit" className={`px-4 py-2 border border-transparent rounded-lg shadow-sm text-sm font-medium text-white transition ${transactionType === 'payment' ? 'bg-green-600 hover:bg-green-700' : 'bg-teal-600 hover:bg-teal-700'}`}>
                                    {editingTransaction ? 'Обновить' : (transactionType === 'payment' ? 'Оплатить' : 'Добавить')}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </div>
    );
}
