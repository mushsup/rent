import { useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { ArrowLeft, Bike, Check, Info, Pencil, ReceiptText } from 'lucide-react';
import { addDays, differenceInCalendarDays, format, parseISO } from 'date-fns';
import { enUS } from 'date-fns/locale';
import { fetchPublicTenantProfile, fetchTenantDetail } from '../../features/tenants/api';
import { buildPaymentLedger } from '../../utils/paymentLedger';
import { queryKeys } from '../../shared/lib/queryKeys';
import type { LedgerEntry, Tenant } from '../../types';
import { getBatteryLabel } from '../../utils/rentalPricing';

type Variant = 'statement' | 'weeks';

const concepts: Array<{ id: Variant; title: string; short: string }> = [
    { id: 'statement', title: 'Выписка', short: 'Таблица' },
    { id: 'weeks', title: 'Недели', short: 'Аренда' },
];

function money(value: number): string {
    return `${Math.round((value + Number.EPSILON) * 100) / 100} zł`;
}

function balanceLabel(ledger: ReturnType<typeof buildPaymentLedger>): { label: string; value: string; tone: string } {
    if (ledger.balanceAtReference > 0) return { label: 'Долг', value: money(ledger.balanceAtReference), tone: 'text-red-500' };
    if (ledger.creditAtReference > 0) return { label: 'Переплата', value: money(ledger.creditAtReference), tone: 'text-lime-500' };
    return { label: 'Баланс', value: '0 zł', tone: 'text-lime-500' };
}

export default function PaymentHistory({ variant, publicMode = false }: { variant: Variant; publicMode?: boolean }) {
    const { id, slug } = useParams();
    const tenantKey = publicMode ? slug || '' : id || '';
    const { data: tenant, isLoading, isError } = useQuery<Tenant | null>({
        queryKey: publicMode ? queryKeys.tenants.publicHistory(tenantKey) : queryKeys.tenants.detail(tenantKey),
        queryFn: () => publicMode ? fetchPublicTenantProfile(tenantKey) : fetchTenantDetail(tenantKey),
        enabled: Boolean(tenantKey),
    });

    const ledger = useMemo(() => buildPaymentLedger(tenant, tenant?.payments || []), [tenant]);

    if (isLoading) return <div className="py-20 text-center text-slate-500">Загрузка истории…</div>;
    if (isError || !tenant) return <div className="py-20 text-center text-red-500">История не найдена</div>;

    const balance = balanceLabel(ledger);

    return (
        <div className="dark min-h-screen bg-slate-950 text-slate-100">
        <div className="mx-auto max-w-6xl px-4 pb-24 pt-6 sm:px-6">
            <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
                <div>
                    <Link to={publicMode ? '/' : `/admin/tenant/${id}`} className="mb-2 inline-flex items-center gap-1 text-sm text-slate-500 hover:text-slate-900 dark:hover:text-white">
                        <ArrowLeft className="h-4 w-4" /> {publicMode ? 'Главная' : 'Карточка арендатора'}
                    </Link>
                    <h1 className="text-2xl font-black tracking-tight text-slate-950 dark:text-white">{tenant.name}</h1>
                    <p className="mt-1 text-sm text-slate-500">{tenant.bikes?.model || 'No bike assigned'} · {Number(tenant.weekly_payment) || 0} zł / week</p>
                </div>
                <div className="rounded-2xl border border-slate-200 bg-white px-5 py-3 text-right dark:border-slate-800 dark:bg-slate-900">
                    <div className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-400">{balance.label}</div>
                    <div className={`text-2xl font-black ${balance.tone}`}>{balance.value}</div>
                </div>
            </div>

            <nav className="mb-8 grid grid-cols-2 gap-1 rounded-xl bg-slate-200/70 p-1 dark:bg-slate-900" aria-label="Варианты истории">
                {concepts.map(concept => (
                    <Link
                        key={concept.id}
                        to={publicMode ? `/history/${slug}/${concept.id}` : `/admin/tenant/${id}/history/${concept.id}`}
                        className={`rounded-lg px-2 py-2.5 text-center text-xs font-bold transition-colors sm:text-sm ${variant === concept.id ? 'bg-white text-slate-950 shadow-sm dark:bg-slate-700 dark:text-white' : 'text-slate-500 hover:text-slate-900 dark:hover:text-white'}`}
                    >
                        <span className="hidden sm:inline">{concept.title}</span><span className="sm:hidden">{concept.short}</span>
                    </Link>
                ))}
            </nav>

            <PaymentTimeline entries={ledger.entries} />

            {variant === 'statement' && <StatementConcept entries={ledger.entries} />}
            {variant === 'weeks' && <WeeksConcept entries={ledger.entries} balance={ledger.balanceAtReference} statementHref={publicMode ? `/history/${slug}/statement` : `/admin/tenant/${id}/history/statement`} />}
        </div>
        </div>
    );
}

function getPaymentInfo(entry: LedgerEntry, entries: LedgerEntry[]) {
    if (entry.type !== 'expected') return null;
    const allocations = entries
        .filter(candidate => candidate.type === 'payment')
        .flatMap(payment => payment.allocations.map(item => ({ payment, item })))
        .filter(({ item }) => item.chargeId === (entry.charge?.id || null) && item.dateKey === entry.dateKey);
    const fallbackAllocations = entries
            .filter(candidate => candidate.type === 'payment')
            .flatMap(payment => payment.allocations.map(item => ({ payment, item })))
            .filter(({ item }) => item.dateKey === entry.dateKey);
    const allocation = [...(allocations.length > 0 ? allocations : fallbackAllocations)]
        .sort((left, right) => right.payment.dateKey.localeCompare(left.payment.dateKey))[0];

    if (!allocation) return null;
    const paymentDate = parseISO(allocation.payment.dateKey);
    return {
        date: paymentDate,
        daysLate: Math.max(differenceInCalendarDays(paymentDate, entry.date), 0),
    };
}

function PaymentTimeline({ entries }: { entries: LedgerEntry[] }) {
    const charges = entries.filter(entry => entry.type === 'expected').slice(-12);
    if (charges.length === 0) return null;

    return <section className="mb-8">
        <div className="mb-2 flex items-center justify-between"><div className="text-[10px] font-bold uppercase tracking-[0.18em] text-slate-500">Платёжная линия</div><div className="text-[10px] text-slate-600">зелёный — вовремя · красный — задержка</div></div>
        <div className="relative overflow-x-auto pb-2">
            <div className="absolute left-0 right-0 top-8 h-px bg-slate-700" />
            <div className="relative flex min-w-max gap-2">
                {charges.map(entry => {
                    const paymentInfo = getPaymentInfo(entry, entries);
                    const paid = entry.remainingAmount <= 0;
                    const future = entry.date.getTime() > new Date().setHours(0, 0, 0, 0);
                    const lateDays = paymentInfo?.daysLate ?? (!future && !paid ? Math.max(differenceInCalendarDays(new Date(), entry.date), 0) : 0);
                    const latePercent = Math.min(lateDays / 7 * 100, 100);
                    const periodStart = entry.charge?.period_start ? parseISO(entry.charge.period_start) : addDays(entry.date, -7);
                    const periodEnd = entry.charge?.period_end ? parseISO(entry.charge.period_end) : addDays(entry.date, -1);
                    const tone = future
                        ? 'bg-slate-800 text-slate-300'
                        : paid && lateDays === 0
                            ? 'bg-lime-400 text-slate-950'
                            : lateDays > 0
                                ? ''
                                : 'bg-amber-400 text-slate-950';
                    const style = paid && lateDays > 0
                        ? { background: `linear-gradient(90deg, rgb(239 68 68) 0 ${latePercent}%, rgb(163 230 53) ${latePercent}% 100%)` }
                        : !paid && lateDays > 0
                            ? { background: `linear-gradient(90deg, rgb(239 68 68) 0 ${latePercent}%, rgb(30 41 59) ${latePercent}% 100%)` }
                            : undefined;
                    const segments = entry.charge?.breakdown || [];
                    return <div key={`timeline-${entry.dateKey}-${entry.charge?.id}`} className="w-32 shrink-0">
                        <div className={`relative h-16 overflow-hidden rounded-xl border border-white/10 px-3 py-2 shadow-lg ${tone}`} style={style}>
                            {segments.length > 1 && <div className="pointer-events-none absolute inset-0 flex">{segments.map((segment, index) => <span key={`${segment.period_start}-${index}`} className="h-full border-r border-white/40 last:border-r-0" style={{ width: `${Math.max(Number(segment.days), 1) / 7 * 100}%` }} />)}</div>}
                            <div className="relative text-[10px] font-black uppercase tracking-wide">{format(periodStart, 'dd.MM')}–{format(periodEnd, 'dd.MM')}</div>
                            <div className="relative mt-1 text-sm font-black">{paid ? lateDays > 0 ? `+${lateDays} дн.` : 'Оплачено' : future ? 'В процессе' : lateDays === 0 ? 'К оплате' : `${money(entry.remainingAmount)}`}</div>
                        </div>
                    </div>;
                })}
            </div>
        </div>
    </section>;
}

function StatementConcept({ entries }: { entries: LedgerEntry[] }) {
    const rows = [...entries].reverse();
    const [expandedKey, setExpandedKey] = useState<string | null>(null);
    return (
        <section className="overflow-hidden rounded-2xl border border-slate-800 bg-slate-900">
            <div className="border-b border-slate-800 px-5 py-4">
                <h2 className="text-lg font-black text-white">Statement</h2>
                <p className="mt-1 text-sm text-slate-500">Every movement and the balance after it.</p>
            </div>
            <div className="hidden grid-cols-[7rem_1fr_9rem] border-b border-slate-800 bg-slate-950/50 px-5 py-2 text-[11px] font-bold uppercase tracking-wider text-slate-500 sm:grid">
                <span>Date</span><span>Movement</span><span className="text-right">Balance</span>
            </div>
            <div className="divide-y divide-slate-800">
                {rows.map(entry => {
                    const rowKey = `${entry.type}-${entry.dateKey}-${entry.paymentId || entry.charge?.id || entry.rentalEvent?.id || entry.adjustmentId}`;
                    const paymentInfo = getPaymentInfo(entry, entries);
                    const isPaidInTime = entry.type === 'expected' && entry.remainingAmount <= 0 && paymentInfo?.daysLate === 0;
                    const status = paymentInfo
                        ? `paid ${format(paymentInfo.date, 'dd.MM')} ${paymentInfo.daysLate > 0 ? `(${paymentInfo.daysLate} days late)` : '(In time)'}`
                        : entry.type === 'expected' && entry.remainingAmount > 0 ? 'open' : null;
                    const isEvent = entry.type === 'rental_event';
                    return (
                    <div key={rowKey} className={`${entry.isCurrentExpected ? 'bg-amber-950/20' : ''}`}>
                        <div className="grid grid-cols-[5rem_1fr_auto] items-center gap-3 px-4 py-3 sm:grid-cols-[7rem_1fr_9rem_auto] sm:px-5">
                            <time className="text-sm tabular-nums text-slate-500">{format(entry.date, 'dd.MM.yy')}</time>
                            <div className="min-w-0">
                                <div className={`text-sm font-black ${isEvent ? 'text-sky-300' : 'text-white'}`}>{isEvent ? rentalEventLabel(entry) : `${entry.type === 'payment' ? '+' : '−'}${money(entry.amount)}`}</div>
                                <div className="mt-0.5 truncate text-xs text-slate-500">{entry.comment || ledgerEntryLabel(entry)}</div>
                                {status && <div className={`mt-0.5 text-xs font-semibold ${status === 'open' ? 'text-slate-500' : 'text-lime-300'}`}>{status}</div>}
                            </div>
                            <div className={`hidden text-right text-sm font-semibold tabular-nums sm:block ${isPaidInTime || (paymentInfo && paymentInfo.daysLate > 0) ? 'text-lime-300' : 'text-slate-400'}`}>
                                {isEvent ? 'событие' : isPaidInTime ? 'In time' : paymentInfo && paymentInfo.daysLate > 0 ? 'Paid late' : money(entry.balance)}
                            </div>
                            <button type="button" onClick={() => setExpandedKey(current => current === rowKey ? null : rowKey)} aria-label="Подробности операции" className={`rounded-full p-1.5 transition-colors ${expandedKey === rowKey ? 'bg-sky-400 text-slate-950' : 'text-slate-500 hover:bg-slate-800 hover:text-white'}`}><Info className="h-4 w-4" /></button>
                        </div>
                        {expandedKey === rowKey && <LedgerDetails entry={entry} />}
                    </div>
                    );
                })}
            </div>
        </section>
    );
}

const rentalEventLabels: Record<string, string> = {
    rental_started: 'Аренда началась',
    bike_changed: 'Смена велосипеда',
    battery_changed: 'Смена батареи',
    rate_changed: 'Изменение тарифа',
    discount_changed: 'Изменение скидки',
    terms_changed: 'Изменение условий',
    day_off: 'Выходной',
    rental_ended: 'Аренда завершена',
};

function rentalEventLabel(entry: LedgerEntry): string {
    return rentalEventLabels[entry.rentalEvent?.event_type || ''] || 'Изменение аренды';
}

function ledgerEntryLabel(entry: LedgerEntry): string {
    if (entry.type === 'expected') return 'Начисление аренды';
    if (entry.type === 'payment') return 'Получена оплата';
    if (entry.type === 'adjustment') return 'Корректировка баланса';
    return rentalEventLabel(entry);
}

function LedgerDetails({ entry }: { entry: LedgerEntry }) {
    const event = entry.rentalEvent;
    const segments = entry.charge?.breakdown || [];
    return <div className="border-t border-slate-800 bg-slate-950/60 px-4 py-4 text-xs text-slate-400 sm:px-[8.75rem]">
        {event && <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
            <DetailItem label="Велосипед" value={event.bike_model || '—'} />
            <DetailItem label="Батарея" value={getBatteryLabel(event.battery_config)} />
            <DetailItem label="Тариф" value={`${Number(event.weekly_payment)} zł/нед.`} />
            <DetailItem label="Скидка" value={`${Number(event.discount_amount || 0)} zł`} />
            {event.reason && <div className="sm:col-span-2 lg:col-span-4"><span className="text-slate-600">Причина</span><div className="mt-0.5 text-slate-300">{event.reason}</div></div>}
        </div>}
        {entry.type === 'expected' && <div>
            <div className="mb-2 text-[10px] font-bold uppercase tracking-wider text-slate-600">Состав периода</div>
            <div className="grid gap-2">{(segments.length > 0 ? segments : [{ period_start: entry.charge?.period_start || entry.dateKey, period_end: entry.charge?.period_end || format(addDays(entry.date, 6), 'yyyy-MM-dd'), days: 7, weekly_payment: entry.amount, discount_amount: 0, amount: entry.amount }]).map((segment, index) => <div key={`${segment.period_start}-${index}`} className="grid grid-cols-2 gap-2 rounded-lg border border-slate-800 bg-slate-900 px-3 py-2 sm:grid-cols-5"><DetailItem label="Период" value={`${format(parseISO(segment.period_start), 'dd.MM')}–${format(parseISO(segment.period_end), 'dd.MM')}`} /><DetailItem label="Дней" value={String(segment.days)} /><DetailItem label="Транспорт" value={segment.bike_model || '—'} /><DetailItem label="Батарея" value={getBatteryLabel(segment.battery_config)} /><DetailItem label="Сумма" value={money(Number(segment.amount))} /></div>)}</div>
        </div>}
        {entry.type === 'payment' && <div><span className="text-slate-600">Распределение платежа</span><div className="mt-2 grid gap-1">{entry.allocations.length > 0 ? entry.allocations.map((allocation, index) => <div key={`${allocation.dateKey}-${index}`} className="flex justify-between gap-4"><span>{format(parseISO(allocation.dateKey), 'dd.MM.yy')}</span><span className="font-semibold text-slate-200">{money(allocation.amount)}</span></div>) : <span>Платёж пока не распределён</span>}</div></div>}
    </div>;
}

function DetailItem({ label, value }: { label: string; value: string }) {
    return <div><span className="text-slate-600">{label}</span><div className="mt-0.5 font-semibold text-slate-300">{value}</div></div>;
}

export function WeeksConcept({ entries, balance, statementHref, onEdit }: { entries: LedgerEntry[]; balance: number; statementHref: string; onEdit?: (entry: LedgerEntry) => void }) {
    const charges = entries.filter(entry => entry.type === 'expected').reverse();
    const hasBalanceDue = balance > 0;
    return (
        <section>
            <div className="mb-6 flex items-end justify-between gap-4 border-b border-slate-800 pb-5">
                <div>
                    <div className="text-[10px] font-bold uppercase tracking-[0.18em] text-slate-500">CURRENT BALANCE</div>
                    <div className={`mt-1 text-5xl font-black tracking-tight ${hasBalanceDue ? 'text-red-400' : 'text-lime-300'}`}>{hasBalanceDue ? `${money(balance)}` : 'In time'}</div>
                    <div className={`mt-1 text-xs font-bold uppercase tracking-[0.16em] ${hasBalanceDue ? 'text-red-400/70' : 'text-lime-300/70'}`}>{hasBalanceDue ? 'balance due' : 'no balance due'}</div>
                </div>
                <Link to={statementHref} className="inline-flex items-center gap-2 rounded-xl border border-lime-300/40 px-3 py-2 text-xs font-black uppercase tracking-[0.12em] text-lime-300 transition-colors hover:bg-lime-300 hover:text-slate-950">
                    <ReceiptText className="h-4 w-4" /> Statement
                </Link>
            </div>
            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                {charges.map(entry => {
                    // A payment can fully cover the current expected charge too.
                    // The dashboard uses the remaining balance, so the detail view
                    // must use the same source of truth instead of hiding the
                    // current entry from the paid state.
                    const isPaid = entry.remainingAmount <= 0;
                    const periodStart = entry.charge?.period_start ? parseISO(entry.charge.period_start) : entry.date;
                    const periodEnd = entry.charge?.period_end ? parseISO(entry.charge.period_end) : addDays(entry.date, 6);
                    const segments = entry.charge?.breakdown || [];
                    return (
                        <article key={`${entry.dateKey}-${entry.charge?.id}`} className={`rounded-2xl border bg-slate-900 p-4 shadow-sm ${isPaid ? 'border-lime-300/70 bg-lime-300/[0.04]' : 'border-red-500/80 bg-red-500/[0.04]'}`}>
                            <div className="flex items-start justify-between gap-3">
                                <div className="flex items-center justify-start gap-2">
                                    <CalendarTile date={periodStart} />
                                    <span className={`h-px w-4 rounded-full ${isPaid ? 'bg-lime-300' : 'bg-red-500'}`} aria-hidden="true" />
                                    <CalendarTile date={periodEnd} />
                                </div>
                            </div>
                            <div className="mt-4 flex items-end justify-between gap-4 border-t border-slate-800 pt-3">
                                {!isPaid ? (
                                    <div>
                                        <div className="text-3xl font-black text-red-400">{money(entry.remainingAmount)} </div>
                                        <div className="mt-1 text-[9px] font-black uppercase tracking-[0.16em] text-red-400/70">BALANCE DUE</div>
                                    </div>
                                ) : (
                                    <div>
                                        <div className="text-2xl font-black text-lime-300">COMPLETE</div>
                                        <div className="mt-1 text-[9px] font-black uppercase tracking-[0.16em] text-lime-300/60">NO BALANCE</div>
                                    </div>
                                )}
                                {isPaid ? <Check className="h-6 w-6 text-lime-300" aria-label="Paid" /> : <div className="text-right"><div className="text-[9px] font-bold uppercase tracking-wider text-slate-500">paid</div><div className="font-black text-slate-300">{money(entry.allocatedAmount)} / {money(entry.amount)}</div></div>}
                            </div>
                            {segments.length > 0 && <div className="mt-4 overflow-hidden rounded-xl border border-slate-800">
                                <div className="flex h-1.5">{segments.map((segment, index) => <span key={`${segment.period_start}-${index}`} className={index % 2 === 0 ? 'bg-sky-400' : 'bg-violet-400'} style={{ width: `${Math.max(Number(segment.days), 1) / 7 * 100}%` }} />)}</div>
                                <div className="divide-y divide-slate-800">{segments.map((segment, index) => <div key={`${segment.period_start}-detail-${index}`} className="grid grid-cols-[1fr_auto] gap-3 px-3 py-2 text-[10px]"><div className="min-w-0"><div className="flex items-center gap-1.5 font-bold text-slate-300"><Bike className="h-3 w-3 text-sky-400" /> {segment.bike_model || 'Транспорт'} · {getBatteryLabel(segment.battery_config)}</div><div className="mt-0.5 text-slate-600">{format(parseISO(segment.period_start), 'dd.MM')}–{format(parseISO(segment.period_end), 'dd.MM')} · {segment.days} дн. · скидка {Number(segment.discount_amount || 0)} zł</div></div><div className="font-black text-slate-200">{money(Number(segment.amount))}</div></div>)}</div>
                            </div>}
                            {onEdit && <button type="button" onClick={() => onEdit(entry)} className="mt-4 inline-flex items-center gap-1.5 rounded-lg border border-slate-700 px-2.5 py-1.5 text-[10px] font-black uppercase tracking-[0.12em] text-slate-400 transition-colors hover:border-lime-300/60 hover:text-lime-300">
                                <Pencil className="h-3.5 w-3.5" /> Edit
                            </button>}
                        </article>
                    );
                })}
            </div>
        </section>
    );
}

const calendarStyle = { shell: 'rounded-lg border-slate-700 bg-slate-900', header: 'bg-slate-800 text-slate-300', day: 'text-white', weekday: 'text-slate-500' };

function CalendarTile({ date }: { date: Date }) {
    const style = calendarStyle;
    const month = format(date, 'MMM', { locale: enUS });
    return (
        <div className={`w-11 overflow-hidden border text-center shadow-sm ${style.shell}`}>
            <div className={`px-0.5 py-0.5 text-[8px] font-black uppercase tracking-[0.1em] ${month === 'Aug' ? 'bg-lime-300 text-slate-950' : style.header}`}>
                {month}
            </div>
            <div className="pb-1 pt-0.5">
                <div className={`text-lg font-black leading-none ${style.day}`}>{format(date, 'd')}</div>
                <div className={`mt-0.5 text-[8px] font-bold uppercase ${style.weekday}`}>{format(date, 'EEE', { locale: enUS })}</div>
            </div>
        </div>
    );
}
