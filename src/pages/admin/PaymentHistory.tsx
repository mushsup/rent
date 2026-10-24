import { useMemo, type ReactNode } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { AlertCircle, ArrowLeft, CalendarDays, Check, CheckCircle2, Clock3, ReceiptText, Repeat2 } from 'lucide-react';
import { format, parseISO } from 'date-fns';
import { fetchPublicTenantProfile, fetchTenantDetail } from '../../features/tenants/api';
import { buildPaymentLedger } from '../../utils/paymentLedger';
import { queryKeys } from '../../shared/lib/queryKeys';
import { formatZl } from '../../shared/lib/money';
import { formatRussianShortDate } from '../../utils/russianDate';
import { EmptyState, ErrorState, LoadingState } from '../../shared/ui';
import type { LedgerEntry, RentalEvent, Tenant } from '../../types';
import { useI18n } from '../../i18n';
import { LanguageToggle } from '../../i18n/LanguageToggle';
import { getErrorMessage } from '../../shared/lib/errors';

type Variant = 'statement' | 'weeks';
type StatementRow = { entry: LedgerEntry; mergedPayment?: LedgerEntry };

function formatStatementDate(date: Date): string {
    return formatRussianShortDate(date);
}

export default function PaymentHistory({ variant = 'statement', publicMode = false }: { variant?: Variant; publicMode?: boolean }) {
    const { t } = useI18n();
    const { id, slug } = useParams();
    const tenantKey = publicMode ? slug || '' : id || '';
    const { data: tenant, isLoading, isError, error, refetch } = useQuery<Tenant | null>({
        queryKey: publicMode ? queryKeys.tenants.publicHistory(tenantKey) : queryKeys.tenants.detail(tenantKey),
        queryFn: () => publicMode ? fetchPublicTenantProfile(tenantKey) : fetchTenantDetail(tenantKey),
        enabled: Boolean(tenantKey),
    });

    const ledger = useMemo(() => buildPaymentLedger(tenant, tenant?.payments || []), [tenant]);
    const statementHref = publicMode ? `/history/${slug}/statement` : `/tenant/${id}/history/statement`;
    const weeksHref = publicMode ? `/history/${slug}/weeks` : `/tenant/${id}/history/weeks`;

    if (isLoading) return <div className="min-h-screen bg-slate-100 py-20 dark:bg-slate-950"><div className="mx-auto max-w-4xl px-4 sm:px-6"><LoadingState label={t('Загрузка истории…')} /></div></div>;
    if (isError) return <div className="min-h-screen bg-slate-100 py-20 dark:bg-slate-950"><div className="mx-auto max-w-4xl px-4 sm:px-6"><ErrorState message={`${t('Не удалось загрузить историю.')} ${t(getErrorMessage(error))}`} retry={() => void refetch()} /><LanguageToggle className="mt-6" /></div></div>;
    if (!tenant) return <div className="min-h-screen bg-slate-100 py-20 dark:bg-slate-950"><div className="mx-auto max-w-4xl px-4 sm:px-6"><EmptyState title={t('История не найдена')} /><LanguageToggle className="mt-6" /></div></div>;

    const balance = ledger.balanceAtReference > 0
        ? { label: t('Долг'), value: formatZl(ledger.balanceAtReference), tone: 'text-red-700 dark:text-red-400' }
        : ledger.creditAtReference > 0
            ? { label: t('Аванс'), value: formatZl(ledger.creditAtReference), tone: 'text-lime-800 dark:text-lime-300' }
            : { label: t('Баланс'), value: '0 zł', tone: 'text-lime-800 dark:text-lime-300' };

    return (
        <div className="min-h-screen bg-slate-100 text-slate-950 dark:bg-slate-950 dark:text-slate-100">
            <main className="mx-auto max-w-4xl px-4 pb-24 pt-6 sm:px-6">
                <div className="mb-8 flex items-start justify-between gap-4">
                    <div>
                        <div className="mb-3 flex items-center justify-between gap-4">
                            <Link to={publicMode ? `/${slug}` : `/tenant/${id}`} className="inline-flex items-center gap-1 text-sm text-slate-500 transition-colors hover:text-slate-950 dark:hover:text-white"><ArrowLeft className="h-4 w-4" /> {t(publicMode ? 'Мои платежи' : 'Карточка арендатора')}</Link>
                            {publicMode && <LanguageToggle />}
                        </div>
                        <h1 className="text-3xl font-bold tracking-tight text-slate-950 dark:text-white">{tenant.name}</h1>
                        <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">{tenant.bikes?.model || t('Нет велосипеда')} · {Number(tenant.weekly_payment) || 0} zł/{t('нед.')}</p>
                    </div>
                    <div className="text-right"><div className="text-[10px] font-bold uppercase tracking-[0.18em] text-slate-500">{balance.label}</div><div className={`mt-1 text-2xl font-bold tabular-nums ${balance.tone}`}>{balance.value}</div></div>
                </div>

                <nav className="mb-6 flex items-center justify-between border-b border-slate-200 pb-3 dark:border-slate-800" aria-label={t('История платежей')}>
                    <span className="text-xs font-bold uppercase tracking-[0.18em] text-slate-500">{t('Выписка')}</span>
                    <Link to={variant === 'weeks' ? statementHref : weeksHref} className="inline-flex items-center gap-2 rounded-lg border border-slate-300 px-3 py-2 text-xs font-bold uppercase tracking-[0.12em] text-slate-600 transition-colors hover:border-lime-600 hover:text-lime-800 dark:border-slate-700 dark:text-slate-300 dark:hover:border-lime-300 dark:hover:text-lime-300">{variant === 'weeks' ? <ReceiptText className="h-4 w-4" /> : <CalendarDays className="h-4 w-4" />}{t(variant === 'weeks' ? 'Выписка' : 'Недели')}</Link>
                </nav>

                {variant === 'statement' ? <StatementConcept entries={ledger.entries} /> : <WeeksConcept entries={ledger.entries} balance={ledger.balanceAtReference} statementHref={statementHref} />}
            </main>
        </div>
    );
}

function statementLabel(entry: LedgerEntry, t: (key: string) => string): string {
    if (entry.type === 'expected') return '';
    if (entry.type === 'payment') return entry.comment || '';
    if (entry.type === 'adjustment') return entry.balanceOverride != null
        ? entry.comment || t('Контрольный баланс')
        : entry.comment || t('Корректировка');
    return entry.rentalEvent?.event_type?.replace(/_/g, ' ') || t('Событие аренды');
}

function statementAmount(entry: LedgerEntry, t: (key: string) => string): string {
    if (entry.type === 'payment') return `+${formatZl(entry.amount)}`;
    if (entry.type === 'adjustment') return entry.balanceOverride != null
        ? `${t('Баланс')} ${formatZl(entry.balanceOverride)}`
        : `${entry.signedAmount >= 0 ? '+' : '−'}${formatZl(Math.abs(entry.amount))}`;
    if (entry.type === 'rental_event') return entry.signedAmount ? `${entry.signedAmount >= 0 ? '+' : '−'}${formatZl(Math.abs(entry.amount))}` : '—';
    return `−${formatZl(entry.amount)}`;
}

function buildStatementRows(entries: LedgerEntry[]): StatementRow[] {
    const mergedPaymentIds = new Set<string>();
    const rows = entries.reduce<StatementRow[]>((result, entry) => {
        if (entry.type !== 'expected' || !entry.charge?.id || entry.remainingAmount > 0) {
            result.push({ entry });
            return result;
        }
        const payment = entries.find(candidate => candidate.type === 'payment'
            && candidate.paymentId
            && !mergedPaymentIds.has(candidate.paymentId)
            && candidate.dateKey <= entry.dateKey
            && candidate.allocations.length === 1
            && candidate.allocations[0].chargeId === entry.charge?.id
            && candidate.allocations[0].amount >= entry.amount);
        if (payment) {
            mergedPaymentIds.add(payment.paymentId!);
            result.push({ entry, mergedPayment: payment });
        } else {
            result.push({ entry });
        }
        return result;
    }, []).filter(row => row.entry.type !== 'payment' || !row.entry.paymentId || !mergedPaymentIds.has(row.entry.paymentId));
    // Unmerged payments are already present in the reduce result. Adding them
    // again here made every standalone payment appear twice in the journal.
    rows.sort((left, right) => right.entry.date.getTime() - left.entry.date.getTime() || (right.entry.type === 'payment' ? 1 : -1));
    return rows;
}

export function StatementConcept({ entries, onEdit, onEditRentalEnd, onApprove, showChart = false, emptyAction }: { entries: LedgerEntry[]; onEdit?: (entry: LedgerEntry) => void; onEditRentalEnd?: (event: RentalEvent) => void; onApprove?: (chargeId: string) => void; showChart?: boolean; emptyAction?: ReactNode }) {
    const { t } = useI18n();
    const rows = buildStatementRows(entries);
    return <section className="overflow-visible rounded-lg border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900/70"><div className="divide-y divide-slate-200 dark:divide-slate-800">
        <div className={showChart ? 'lg:grid lg:grid-cols-[minmax(0,1fr)_25%]' : ''}>
        <div className="divide-y divide-slate-200 dark:divide-slate-800">
        {rows.map(({ entry, mergedPayment }) => {
            const rowKey = `${entry.type}-${entry.dateKey}-${entry.paymentId || entry.charge?.id || entry.rentalEvent?.id || entry.adjustmentId}`;
            const editableEntry = mergedPayment || entry;
            const rentalEnd = editableEntry.type === 'rental_event' && editableEntry.rentalEvent?.event_type === 'rental_ended' ? editableEntry.rentalEvent : null;
            const editable = Boolean(rentalEnd ? onEditRentalEnd : onEdit && (editableEntry.type === 'payment' || editableEntry.type === 'adjustment' || (editableEntry.type === 'expected' && editableEntry.charge)));
            const isFutureExpected = entry.type === 'expected' && entry.dateKey > format(new Date(), 'yyyy-MM-dd');
            const pending = Boolean(!isFutureExpected && onApprove && entry.type === 'expected' && entry.charge?.id && !entry.charge.approved_at);
            const openEdit = () => rentalEnd ? onEditRentalEnd?.(rentalEnd) : onEdit?.(editableEntry);
            return <div key={rowKey} role={editable ? 'button' : undefined} tabIndex={editable ? 0 : undefined} onClick={editable ? openEdit : undefined} onKeyDown={editable ? event => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); openEdit(); } } : undefined} className={`grid min-h-[52px] min-w-0 grid-cols-[5rem_minmax(0,1fr)_2rem] items-center gap-2 border-l-2 px-3 py-2 sm:px-4 ${editable ? 'cursor-pointer transition-colors hover:bg-slate-100 dark:hover:bg-slate-800/60' : ''} ${pending ? 'border-transparent bg-slate-100 dark:bg-slate-800/50' : 'border-transparent'} ${entry.isCurrentExpected && !pending && !isFutureExpected ? 'bg-orange-500/[0.06]' : ''} ${isFutureExpected ? 'opacity-45' : ''}`}>
                <time className="w-20 shrink-0 text-sm font-bold tabular-nums text-slate-500 dark:text-slate-400">{formatStatementDate(entry.date)}</time>
                <div className="min-w-0 flex-1"><div className={`flex items-center gap-2 text-base font-bold tabular-nums ${entry.type === 'payment' ? 'text-lime-800 dark:text-lime-300' : entry.type === 'expected' && !isFutureExpected ? 'text-slate-950 dark:text-white' : 'text-slate-500 dark:text-slate-400'}`}>{mergedPayment ? <><button type="button" className="hover:text-slate-700 dark:hover:text-slate-300" onClick={event => { event.stopPropagation(); onEdit?.(entry); }}>−{formatZl(entry.amount)}</button><span className="text-slate-400 dark:text-slate-600">·</span><button type="button" className="text-lime-800 hover:text-lime-700 dark:text-lime-300 dark:hover:text-lime-200" onClick={event => { event.stopPropagation(); onEdit?.(mergedPayment); }}>+{formatZl(mergedPayment.amount)}</button></> : isFutureExpected ? formatZl(entry.amount) : statementAmount(entry, t)}{entry.isAutomatic && <Repeat2 className={`h-3.5 w-3.5 shrink-0 ${isFutureExpected ? 'text-slate-400 dark:text-slate-500' : 'text-slate-400'}`} aria-label={t('Цикличное начисление')} />}</div>{(mergedPayment || statementLabel(entry, t)) && <div className="truncate text-[10px] font-bold uppercase tracking-[0.12em] text-slate-500">{mergedPayment ? t('Оплачено вовремя') : statementLabel(entry, t)}</div>}</div>
                <div className="flex w-8 justify-center">
                    {pending && <button type="button" onClick={event => { event.stopPropagation(); entry.charge?.id && onApprove?.(entry.charge.id); }} aria-label={t('Утвердить начисление')} title={t('Утвердить начисление')} className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-lime-500 text-slate-950 transition-colors hover:bg-lime-400"><Check className="h-4 w-4" /></button>}
                </div>
            </div>;
        })}
        {rows.length === 0 && <EmptyState title={t('Выписка пока пустая')} action={emptyAction} />}
        </div>
        {showChart && <VerticalBalanceChart rows={rows} />}
        </div>
    </div></section>;
}

function VerticalBalanceChart({ rows }: { rows: StatementRow[] }) {
    const { t } = useI18n();
    const chartRows = rows.slice(0, 12);
    // A merged on-time row must use the balance after the payment, not the
    // intermediate balance after the charge. Otherwise every paid week looks
    // like a red debt spike.
    const todayKey = format(new Date(), 'yyyy-MM-dd');
    const values = chartRows.map(({ entry }) => entry.type === 'expected' && entry.dateKey > todayKey ? 0 : entry.signedAmount);
    const max = Math.max(...values.map(value => Math.abs(value)), 1);
    const width = 160;
    const rowHeight = 60;
    const height = Math.max(chartRows.length * rowHeight, rowHeight);
    const xFor = (value: number) => 12 + ((value + max) / (max * 2)) * (width - 24);
    const zeroX = xFor(0);
    return <div className="hidden min-w-0 border-l border-slate-200/80 bg-slate-100/60 dark:border-slate-800/80 dark:bg-slate-950/40 lg:block">
        <div className="relative px-2" style={{ height }} aria-label={t('Вертикальный график баланса')}>
            <svg className="absolute inset-x-2 top-0 h-full w-[calc(100%-1rem)]" viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none" role="img">
                <line x1={zeroX} x2={zeroX} y1="0" y2={height} stroke="rgba(148,163,184,.35)" strokeDasharray="3 5" />
                {values.map((value, index) => <rect key={`${value}-${index}`} x={Math.min(zeroX, xFor(value))} y={index * rowHeight + 19} width={Math.abs(xFor(value) - zeroX)} height="22" rx="4" fill={value > 0 ? '#fb7185' : '#a3e635'} opacity=".9" />)}
            </svg>
            {chartRows.map(({ entry }, index) => { const future = entry.type === 'expected' && entry.dateKey > todayKey; return <div key={`${entry.type}-${entry.dateKey}-${index}`} className="pointer-events-none absolute inset-x-2 flex items-center justify-between text-[8px] font-bold text-slate-500 dark:text-slate-600" style={{ top: index * rowHeight + rowHeight / 2 - 6 }}><span>{formatStatementDate(entry.date).slice(0, 5)}</span><span className={future ? 'text-slate-400 dark:text-slate-600' : values[index] > 0 ? 'text-red-700 dark:text-red-300' : 'text-lime-800 dark:text-lime-300'}>{future ? '—' : Math.round(values[index])}</span></div>; })}
        </div>
        <div className="flex justify-between px-3 pb-3 text-[9px] font-bold text-slate-500"><span>{t('аванс')}</span><span>{t('долг')}</span></div>
    </div>;
}

export function WeeksConcept({ entries, balance, statementHref, onEdit }: { entries: LedgerEntry[]; balance: number; statementHref: string; onEdit?: (entry: LedgerEntry) => void }) {
    const { t } = useI18n();
    const charges = entries.filter(entry => entry.type === 'expected').reverse();
    return <section><div className="mb-5 flex items-end justify-between gap-4 border-b border-slate-200 pb-5 dark:border-slate-800"><div><div className="text-[10px] font-bold uppercase tracking-[0.18em] text-slate-500">{t('Текущий баланс')}</div><div className={`mt-1 text-4xl font-bold tabular-nums ${balance > 0 ? 'text-red-700 dark:text-red-400' : 'text-lime-800 dark:text-lime-300'}`}>{balance > 0 ? formatZl(balance) : t('Вовремя')}</div></div><Link to={statementHref} className="inline-flex items-center gap-2 rounded-lg border border-slate-300 px-3 py-2 text-xs font-bold uppercase tracking-[0.12em] text-slate-600 hover:border-lime-600 hover:text-lime-800 dark:border-slate-700 dark:text-slate-300 dark:hover:border-lime-300 dark:hover:text-lime-300"><ReceiptText className="h-4 w-4" /> {t('Выписка')}</Link></div>
        <div className="grid gap-4 sm:grid-cols-2">{charges.map(entry => {
            const payments = entries.filter(candidate => candidate.type === 'payment' && candidate.allocations.some(allocation => allocation.chargeId === entry.charge?.id));
            const payment = payments[payments.length - 1];
            const isFuture = entry.dateKey > format(new Date(), 'yyyy-MM-dd');
            const hasPartialPayment = payments.length > 0;
            const status = isFuture ? 'expected' : entry.remainingAmount <= 0 && payment && payment.dateKey > entry.dateKey ? 'late' : entry.remainingAmount <= 0 ? 'ontime' : hasPartialPayment ? 'partial' : 'unpaid';
            const config = {
                ontime: { label: t('Оплачено вовремя'), icon: CheckCircle2, border: 'border-lime-600/40 dark:border-lime-400/40', background: 'bg-lime-500/[0.08]', text: 'text-lime-800 dark:text-lime-300', chip: 'bg-lime-500/15' },
                late: { label: t('Оплачено с опозданием'), icon: Clock3, border: 'border-amber-600/50 dark:border-amber-400/50', background: 'bg-amber-500/[0.08]', text: 'text-amber-800 dark:text-amber-300', chip: 'bg-amber-500/15' },
                unpaid: { label: t('Не оплачено'), icon: AlertCircle, border: 'border-red-600/50 dark:border-red-400/50', background: 'bg-red-500/[0.08]', text: 'text-red-800 dark:text-red-300', chip: 'bg-red-500/15' },
                partial: { label: t('Частично оплачено'), icon: Clock3, border: 'border-amber-600/50 dark:border-amber-400/50', background: 'bg-amber-500/[0.08]', text: 'text-amber-800 dark:text-amber-300', chip: 'bg-amber-500/15' },
                expected: { label: t('Ожидается'), icon: CalendarDays, border: 'border-slate-200 dark:border-slate-800', background: 'bg-slate-100 dark:bg-slate-950/20', text: 'text-slate-500', chip: 'bg-slate-200/70 dark:bg-slate-800/70' },
            }[status];
            const StatusIcon = config.icon;
            return <article key={`${entry.dateKey}-${entry.charge?.id}`} role={onEdit ? 'button' : undefined} tabIndex={onEdit ? 0 : undefined} onClick={onEdit ? () => onEdit(entry) : undefined} onKeyDown={onEdit ? event => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); onEdit(entry); } } : undefined} className={`rounded-lg border ${config.border} ${config.background} p-4 shadow-sm ${status === 'expected' ? 'opacity-50' : ''} ${onEdit ? 'cursor-pointer transition-transform hover:-translate-y-0.5' : ''}`}>
                <div className="flex items-start justify-between gap-3"><div><div className="text-xs font-bold uppercase tracking-[0.14em] text-slate-500">{t('Неделя')} · {entry.charge?.period_start ? formatStatementDate(parseISO(entry.charge.period_start)) : formatStatementDate(entry.date)}</div><div className="mt-1 flex items-center gap-2 text-2xl font-bold tabular-nums text-slate-950 dark:text-white">{formatZl(entry.amount)}{entry.isAutomatic && <Repeat2 className={`h-5 w-5 ${status === 'expected' ? 'text-slate-400 dark:text-slate-500' : 'text-slate-400'}`} aria-label={t('Цикличное начисление')} />}</div></div><div className={`flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.08em] ${config.chip} ${config.text}`}><StatusIcon className="h-3.5 w-3.5" />{config.label}</div></div>
                <div className="mt-4 flex items-center justify-between border-t border-slate-200 pt-3 text-xs dark:border-white/10"><span className="text-slate-500">{t('Срок:')} <strong className="text-slate-700 dark:text-slate-300">{formatStatementDate(entry.date)}</strong></span>{status === 'late' && payment && <span className="font-bold text-amber-800 dark:text-amber-300">{t('Оплачено')} {formatStatementDate(payment.date)}</span>}{status === 'partial' && <span className="font-bold text-amber-800 dark:text-amber-300">{t('осталось')} {formatZl(entry.remainingAmount)}</span>}{status === 'unpaid' && <span className="font-bold text-red-700 dark:text-red-300">{t('долг')}</span>}{status === 'expected' && <span className="font-bold text-slate-500">{t('будущий платёж')}</span>}{status === 'ontime' && <span className="font-bold text-lime-800 dark:text-lime-300">{t('закрыто')}</span>}</div>
            </article>;
        })}{charges.length === 0 && <div className="rounded-xl border border-slate-200 px-5 py-10 text-center text-sm text-slate-500 dark:border-slate-800">{t('Недели пока не созданы')}</div>}</div>
    </section>;
}
