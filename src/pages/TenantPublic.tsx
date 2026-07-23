import { useParams, Link } from 'react-router-dom';
import { useEffect, useState } from 'react';
import { Bike, Calendar, AlertCircle, TrendingDown, CheckCircle2 } from 'lucide-react';
import { calculateDebt, getTenantWeeklyPayment } from '../utils/calculateDebt';
import { format } from 'date-fns';
import { formatRussianDate } from '../utils/russianDate';
import { fetchPublicTenantProfile } from '../features/tenants/api';

export default function TenantPublic() {
    const { slug } = useParams();
    const [tenant, setTenant] = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);

    useEffect(() => {
        document.title = "Моя Аренда — E-Bike Rent";
        async function loadTenant() {
            try {
                const data = await fetchPublicTenantProfile(slug || '');
                if (!data) throw new Error('Tenant not found');
                setTenant(data);
                document.title = `${data.name} - аренда электровелосипеда`;
            } catch {
                setError('Арендатор не найден');
            }
            setLoading(false);
        }

        loadTenant();
    }, [slug]);

    if (loading) return <div className="min-h-screen bg-slate-900 flex justify-center items-center text-white">Загрузка...</div>;

    if (error) {
        return (
            <div className="min-h-screen bg-slate-900 flex flex-col justify-center items-center text-white p-4 text-center font-sans selection:bg-lime-500/30">
                <Bike className="w-20 h-20 text-lime-500 mb-6" />
                <h1 className="text-8xl font-black text-transparent bg-clip-text bg-gradient-to-r from-lime-500 to-cyan-500 mb-4">404</h1>
                <h2 className="text-2xl font-bold mb-6">Арендатор не найден</h2>
                <p className="text-slate-400 max-w-sm mb-10 text-lg">
                    Похоже, ссылка недействительна или страница была удалена.
                </p>
                <Link to="/" className="inline-flex items-center px-6 py-3 rounded-full bg-lime-600 hover:bg-lime-500 text-white font-medium transition-all shadow-[0_0_20px_rgba(190,242,100,0.24)] hover:-translate-y-0.5">
                    На главную
                </Link>
            </div>
        );
    }

    const {
        totalDebt,
        overdueAmount,
        isOverdue,
        hasDueToday,
        oldestUnpaidDate,
        nextPaymentDate,
        expectedAmount
    } = calculateDebt(tenant, tenant?.payments || []);

    const lastPayment = tenant?.payments?.length > 0
        ? [...tenant.payments].sort((a, b) => new Date(b.payment_date).getTime() - new Date(a.payment_date).getTime())[0]
        : null;

    return (
        <div className="min-h-screen bg-slate-900 py-6 px-3 sm:px-4 lg:px-6 font-sans">
            <div className="max-w-3xl mx-auto space-y-4">

                {/* Profile Card */}
                <div className="bg-slate-800 rounded-2xl shadow-xl border border-slate-700 p-4 md:p-6">
                    <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                        <div className="flex items-center space-x-5">
                            <div className="h-16 w-16 bg-lime-900 shadow-inner rounded-full flex items-center justify-center ring-4 ring-slate-800">
                                <span className="text-2xl font-bold text-lime-300">
                                    {tenant?.name?.charAt(0).toUpperCase()}
                                </span>
                            </div>
                            <div>
                                <h1 className="text-2xl font-bold text-white tracking-tight">{tenant?.name}</h1>
                                <div className="flex items-center mt-1.5 text-slate-400 bg-slate-900 px-3 py-1 rounded-full text-sm inline-flex">
                                    <Bike className="w-4 h-4 mr-1.5 text-lime-400" />
                                    <span>{tenant?.bikes?.model || 'Нет велосипеда'}</span>
                                </div>
                            </div>
                        </div>
                        <div className="text-left sm:text-right bg-slate-900/50 p-4 rounded-lg border border-slate-700 w-full sm:w-auto">
                            <div className="text-sm text-slate-400 mb-1">Ставка (в неделю)</div>
                            <div className="text-2xl font-bold text-white">{getTenantWeeklyPayment(tenant)} <span className="text-slate-400 text-lg">zł</span></div>
                        </div>
                    </div>
                </div>

                {/* Status Dashboard */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {/* Текущий статус */}
                    <div className={`${totalDebt > 0 ? 'bg-red-950/30 border-red-900/50' : 'bg-slate-800 border-slate-700'} rounded-2xl shadow-xl border p-5 flex flex-col justify-between relative overflow-hidden`}>
                        {totalDebt === 0 && (
                            <div className="absolute -right-6 -top-6 text-green-900/20">
                                <CheckCircle2 className="w-32 h-32" />
                            </div>
                        )}
                        <div className="relative z-10">
                            <div className="flex items-center space-x-3 mb-6">
                                <div className={`p-2 rounded-lg ${totalDebt > 0 ? 'bg-red-900/40' : 'bg-green-900/30'}`}>
                                    <TrendingDown className={`w-5 h-5 ${totalDebt > 0 ? 'text-red-400' : 'text-green-400'}`} />
                                </div>
                                <h2 className="text-lg font-medium text-white">Текущий статус</h2>
                            </div>

                            <div className="mt-2 text-center sm:text-left py-4">
                                {totalDebt > 0 ? (
                                    <>
                                        <div className="text-sm font-medium text-red-400 mb-1 uppercase tracking-wider">Задолженность</div>
                                        <span className="text-5xl font-bold tracking-tight text-white">{totalDebt} <span className="text-2xl text-red-400">zł</span></span>
                                    </>
                                ) : (
                                    <>
                                        <div className="text-sm font-medium text-green-400 mb-1 uppercase tracking-wider">Баланс в норме</div>
                                        <span className="text-4xl font-bold tracking-tight text-white">Всё оплачено</span>
                                    </>
                                )}
                            </div>
                        </div>

                        <div className="mt-4 pt-4 border-t border-slate-700/50 relative z-10">
                            <p className="text-sm text-slate-400 leading-relaxed">
                                {totalDebt > 0
                                    ? <span className="text-red-300">Пожалуйста, внесите оплату в ближайшее время.</span>
                                    : <span className="text-green-300">У вас нет задолженностей. Спасибо!</span>}
                            </p>
                        </div>
                    </div>

                    {/* Платежи */}
                    <div className="bg-slate-800 rounded-2xl shadow-xl border border-slate-700 p-5 flex flex-col justify-between">

                        <div className="flex items-center space-x-3 mb-5">
                            <div className="p-2 bg-slate-700 rounded-lg">
                                <Calendar className="w-5 h-5 text-lime-400" />
                            </div>
                            <h2 className="text-lg font-medium text-white">Платежи</h2>
                        </div>

                        {totalDebt > 0 && (
                            <div className="bg-red-950/40 p-4 rounded-lg border border-red-900/50 mb-4">
                                <div className="text-sm text-red-400 mb-2 font-medium">
                                    {isOverdue ? 'Просроченная задолженность' : hasDueToday ? 'К оплате сегодня' : 'Текущая задолженность'}
                                </div>
                                <div className="font-bold text-red-200 flex items-center justify-between text-sm">
                                    <span>{oldestUnpaidDate ? `Не оплачено с ${formatRussianDate(oldestUnpaidDate, 'dd MMM yyyy')}` : 'Ожидает оплаты'}</span>
                                    <span className="bg-red-900/80 px-2 py-0.5 rounded border border-red-700/50">{isOverdue ? overdueAmount : totalDebt} zł</span>
                                </div>
                            </div>
                        )}

                        <div className="bg-lime-900/20 p-4 rounded-lg border border-lime-500/20 mb-4">
                            <div className="text-sm text-lime-300 mb-1">Следующий ожидаемый платеж</div>
                            <div className="font-bold text-lime-100 flex items-center justify-between">
                                <span>{nextPaymentDate ? formatRussianDate(nextPaymentDate, 'dd MMM yyyy') : '—'}</span>
                                <span className="bg-lime-600 px-2 py-0.5 rounded text-sm">{expectedAmount} zł</span>
                            </div>
                        </div>

                        <div className="bg-slate-900/30 p-3 rounded-lg border border-slate-700/50 flex items-center justify-between">
                            <div className="text-xs text-slate-400">Последний платеж</div>
                            <div className="text-sm text-slate-300">
                                {lastPayment
                                    ? `${formatRussianDate(new Date(lastPayment.payment_date), 'dd MMM')} — ${lastPayment.amount} zł`
                                    : <span className="italic text-slate-400">Оплат не было</span>}
                            </div>
                        </div>
                    </div>
                </div>

                {tenant?.admin_comment && (
                    <div className="bg-teal-900/20 rounded-2xl p-5 border border-teal-800/50 shadow-inner">
                        <div className="flex items-center space-x-2 text-teal-400 mb-3">
                            <AlertCircle className="w-5 h-5" />
                            <h3 className="text-sm font-bold uppercase tracking-wider">Сообщение администратора</h3>
                        </div>
                        <p className="text-teal-100 text-lg leading-relaxed bg-black/20 p-4 rounded-lg shadow-inner whitespace-pre-line">{tenant.admin_comment}</p>
                    </div>
                )}

            </div>
        </div>
    );
}
