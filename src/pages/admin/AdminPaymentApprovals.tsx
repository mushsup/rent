import { useMemo, useState, type KeyboardEvent, type MouseEvent } from 'react';
import { Check, ChevronRight, CircleDollarSign } from 'lucide-react';
import { format } from 'date-fns';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import { approveTenantPaymentCharge, fetchTodayPaymentApprovals } from '../../features/tenants/api';
import { approvePaymentRequest, fetchPendingPaymentRequests, rejectPaymentRequest, type PaymentRequest } from '../../features/tenants/paymentRequestsApi';
import { queryKeys } from '../../shared/lib/queryKeys';
import { getErrorMessage } from '../../shared/lib/errors';
import { formatZl } from '../../shared/lib/money';
import { formatDateTime, formatDate } from '../../shared/lib/format';
import { Button, Dialog, EmptyState, ErrorState, LoadingState } from '../../shared/ui';
import { DateInput } from '../../shared/ui/DateInput';
import type { PaymentCharge, Tenant } from '../../types';

type Approval = { tenant: Tenant; charge: PaymentCharge };

function todayKey(): string { return format(new Date(), 'yyyy-MM-dd'); }
function bikeName(tenant: Tenant, charge: PaymentCharge): string { return charge.breakdown?.[0]?.bike_model || tenant.bikes?.model || 'Нет велосипеда'; }
function batteryName(tenant: Tenant, charge: PaymentCharge): string { return charge.breakdown?.[0]?.battery_config || tenant.battery_config || 'Не указана'; }

export default function AdminPaymentApprovals() {
    const navigate = useNavigate();
    const queryClient = useQueryClient();
    const [approvingId, setApprovingId] = useState<string | null>(null);
    const [requestActionId, setRequestActionId] = useState<string | null>(null);
    const [approvalRequest, setApprovalRequest] = useState<PaymentRequest | null>(null);
    const [approvalDate, setApprovalDate] = useState(todayKey());
    const [approvalNote, setApprovalNote] = useState('');
    const { data: tenants = [], isLoading, isError } = useQuery<Tenant[]>({ queryKey: queryKeys.tenants.paymentApprovals, queryFn: () => fetchTodayPaymentApprovals() });
    const requestsQuery = useQuery({ queryKey: queryKeys.tenants.paymentRequests, queryFn: fetchPendingPaymentRequests });
    const paymentRequests = requestsQuery.data || [];
    const approvals = useMemo<Approval[]>(() => tenants.flatMap(tenant => (tenant.payment_charges || []).filter(charge => charge.due_date <= todayKey() && !charge.approved_at && charge.status !== 'waived').map(charge => ({ tenant, charge }))).sort((a, b) => a.charge.due_date.localeCompare(b.charge.due_date) || String(a.charge.created_at || '').localeCompare(String(b.charge.created_at || '')) || (a.tenant.name || '').localeCompare(b.tenant.name || '')), [tenants]);

    const approve = async (event: MouseEvent<HTMLButtonElement>, approval: Approval) => {
        event.stopPropagation();
        if (!approval.charge.id) return;
        setApprovingId(approval.charge.id);
        try {
            await approveTenantPaymentCharge(approval.charge.id);
            toast.success(`Начисление для ${approval.tenant.name} утверждено`);
            await queryClient.invalidateQueries({ queryKey: queryKeys.tenants.paymentApprovals });
            queryClient.invalidateQueries({ queryKey: queryKeys.tenants.dashboards });
            queryClient.invalidateQueries({ queryKey: queryKeys.tenants.detail(approval.tenant.id || '') });
        } catch (error) { toast.error(getErrorMessage(error)); } finally { setApprovingId(null); }
    };

    const approveRequest = async () => {
        if (!approvalRequest) return;
        const request = approvalRequest;
        setRequestActionId(request.id);
        try {
            await approvePaymentRequest(request.id, approvalDate, approvalNote || undefined);
            toast.success('Заявка подтверждена и внесена в баланс');
            setApprovalRequest(null);
            await queryClient.invalidateQueries({ queryKey: queryKeys.tenants.paymentRequests });
            await queryClient.invalidateQueries({ queryKey: queryKeys.tenants.paymentApprovals });
            await queryClient.invalidateQueries({ queryKey: queryKeys.tenants.all });
        } catch (error) { toast.error(getErrorMessage(error)); } finally { setRequestActionId(null); }
    };

    const rejectRequest = async (request: PaymentRequest) => {
        const reason = window.prompt('Причина отклонения заявки:');
        if (!reason?.trim()) return;
        setRequestActionId(request.id);
        try {
            await rejectPaymentRequest(request.id, reason);
            toast.success('Заявка отклонена');
            await queryClient.invalidateQueries({ queryKey: queryKeys.tenants.paymentRequests });
        } catch (error) { toast.error(getErrorMessage(error)); } finally { setRequestActionId(null); }
    };

    if (isLoading || requestsQuery.isLoading) return <div className="mx-auto max-w-4xl"><LoadingState label="Загрузка платежей…" /></div>;
    if (isError || requestsQuery.isError) return <div className="mx-auto max-w-4xl"><ErrorState message="Не удалось загрузить платежи." retry={() => { void queryClient.invalidateQueries({ queryKey: queryKeys.tenants.paymentApprovals }); void requestsQuery.refetch(); }} /></div>;

    return <div className="mx-auto max-w-4xl">
        <div className="mb-7 flex items-end justify-between gap-4"><div><p className="text-xs font-bold uppercase tracking-[0.18em] text-slate-500">{formatDate(todayKey())}</p><h1 className="mt-1 text-3xl font-bold text-slate-950 dark:text-white">Утверждение платежей</h1><p className="mt-2 text-sm text-slate-500">Все начисления до сегодняшнего дня, ожидающие проверки</p></div><div className="rounded-xl border border-slate-200 bg-white px-4 py-3 text-right dark:border-slate-700 dark:bg-slate-800/60"><div className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">Ожидают</div><div className="text-2xl font-bold tabular-nums text-slate-950 dark:text-slate-200">{approvals.length}</div></div></div>
        {paymentRequests.length > 0 && <section className="mb-5 overflow-hidden rounded-lg border border-amber-600/30 bg-amber-500/[0.06]"><div className="border-b border-amber-500/20 px-4 py-3"><h2 className="font-bold text-slate-950 dark:text-white">Заявки клиентов на пополнение</h2><p className="mt-1 text-xs text-slate-500 dark:text-slate-400">Подтверждайте только после фактического получения денег.</p></div>{paymentRequests.map(request => <PaymentRequestRow key={request.id} request={request} busy={requestActionId === request.id} onApprove={() => { setApprovalRequest(request); setApprovalDate(todayKey()); setApprovalNote(''); }} onReject={() => rejectRequest(request)} />)}</section>}
        <section className="overflow-hidden rounded-lg border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900/70">
            {approvals.map(({ tenant, charge }) => { const openTenant = () => navigate(`/tenant/${tenant.id}`); const onRowKeyDown = (event: KeyboardEvent<HTMLDivElement>) => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); openTenant(); } }; return <div key={charge.id} role="button" tabIndex={0} onClick={openTenant} onKeyDown={onRowKeyDown} className="group flex w-full cursor-pointer items-center gap-4 border-b border-slate-200 px-4 py-4 text-left transition-colors last:border-b-0 hover:bg-slate-100 dark:border-slate-800 dark:hover:bg-slate-800/70 sm:px-5"><div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-300"><CircleDollarSign className="h-5 w-5" /></div><div className="min-w-0 flex-1"><div className="truncate text-base font-bold text-slate-950 dark:text-white">{tenant.name}</div><div className="mt-1 truncate text-xs text-slate-500">{bikeName(tenant, charge)} · батарея {batteryName(tenant, charge)}</div></div><div className="shrink-0 text-right"><div className="text-lg font-bold tabular-nums text-slate-950 dark:text-white">{formatZl(Number(charge.amount))}</div><div className="text-[10px] font-bold uppercase tracking-wider text-slate-400">аренда</div></div><button type="button" aria-label="Утвердить начисление" title="Утвердить начисление" onClick={event => approve(event, { tenant, charge })} className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-lime-500 text-slate-950 transition-colors hover:bg-lime-400">{approvingId === charge.id ? '…' : <Check className="h-4 w-4" />}</button><ChevronRight className="hidden h-5 w-5 shrink-0 text-slate-400 transition-colors group-hover:text-slate-600 dark:text-slate-600 dark:group-hover:text-slate-300 sm:block" /></div>; })}
            {approvals.length === 0 && <EmptyState title="Все сегодняшние платежи утверждены" action={<p className="text-sm text-slate-500">Новых начислений для проверки нет.</p>} />}
        </section>
        <Dialog open={Boolean(approvalRequest)} title="Подтвердить получение оплаты" size="sm" onClose={() => setApprovalRequest(null)}>
            {approvalRequest && <div className="space-y-4"><p className="text-sm text-slate-600 dark:text-slate-300">{approvalRequest.tenant?.name || 'Клиент'} · {formatZl(Number(approvalRequest.amount))}</p><label className="block text-sm font-medium text-slate-700 dark:text-slate-300">Дата получения<DateInput value={approvalDate} max={todayKey()} onChange={setApprovalDate} className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 dark:border-slate-700 dark:bg-slate-950" /></label><label className="block text-sm font-medium text-slate-700 dark:text-slate-300">Комментарий<textarea value={approvalNote} onChange={event => setApprovalNote(event.target.value)} className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 dark:border-slate-700 dark:bg-slate-950" rows={3} /></label><div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end"><Button variant="secondary" type="button" onClick={() => setApprovalRequest(null)}>Отмена</Button><Button type="button" disabled={requestActionId === approvalRequest.id} onClick={approveRequest}>{requestActionId === approvalRequest.id ? 'Сохраняем…' : 'Подтвердить оплату'}</Button></div></div>}
        </Dialog>
    </div>;
}

function PaymentRequestRow({ request, busy, onApprove, onReject }: { request: PaymentRequest; busy: boolean; onApprove: () => void; onReject: () => void }) {
    const isCash = request.payment_method === 'cash';
    return <div className="flex flex-col gap-3 border-b border-slate-200 px-4 py-4 last:border-b-0 dark:border-slate-800 sm:flex-row sm:items-center"><div className="min-w-0 flex-1"><div className="truncate font-bold text-slate-950 dark:text-white">{request.tenant?.name || 'Клиент'}</div><div className="mt-1 text-xs text-slate-500 dark:text-slate-400">{isCash ? 'Наличные · после визита' : 'Банковская оплата'} · заявлено {formatDateTime(request.requested_at)}</div>{request.client_note && <div className="mt-1 text-xs text-slate-500">{request.client_note}</div>}</div><div className="text-lg font-bold tabular-nums text-amber-800 dark:text-amber-300">{formatZl(Number(request.amount))}</div><div className="flex gap-2"><button type="button" disabled={busy} onClick={onReject} className="min-h-10 rounded-lg border border-red-500/30 px-3 text-xs font-bold text-red-700 dark:text-red-300">Отклонить</button><button type="button" disabled={busy} onClick={onApprove} className="min-h-10 rounded-lg bg-lime-500 px-3 text-xs font-bold text-slate-950 hover:bg-lime-400">{busy ? '…' : 'Подтвердить'}</button></div></div>;
}
