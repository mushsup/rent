import { Plus, RotateCcw, Check, CalendarOff } from 'lucide-react';
import { buildPaymentLedger } from '../../utils/paymentLedger';
import { WeeksConcept } from './PaymentHistory';

type PaymentLedger = ReturnType<typeof buildPaymentLedger>;
type LedgerEntry = PaymentLedger['entries'][number];

interface TenantBalanceSectionProps {
    ledger: PaymentLedger;
    tenantId: string;
    onAddEntry: () => void;
    onAddDayOff: () => void;
    onResetAccounting: () => void;
    onEditEntry: (entry: LedgerEntry) => void;
}

export function TenantBalanceSection({ ledger, tenantId, onAddEntry, onAddDayOff, onResetAccounting, onEditEntry }: TenantBalanceSectionProps) {
    return (
        <div className="md:col-span-2 bg-white dark:bg-slate-900 rounded-lg shadow border border-slate-200 dark:border-slate-800 p-4 sm:p-6">
            <div className="mb-4 flex flex-wrap items-center gap-3">
                <h3 className="text-lg font-medium text-slate-900 dark:text-white">Баланс</h3>
                <div className={`ml-auto flex items-center gap-1 text-base font-bold ${ledger.balanceAtReference > 0 ? 'text-red-500 dark:text-red-400' : 'text-lime-700 dark:text-lime-400'}`}>
                    {ledger.balanceAtReference > 0
                        ? `${ledger.balanceAtReference} zł`
                        : ledger.creditAtReference > 0
                            ? `аванс ${ledger.creditAtReference} zł`
                            : '0 zł'}
                    {ledger.balanceAtReference <= 0 && <Check className="h-4 w-4" />}
                </div>
                <button type="button" onClick={onAddDayOff} className="inline-flex items-center gap-2 rounded-md border border-sky-500/30 bg-sky-500/10 px-3 py-2 text-xs font-semibold text-sky-700 transition-colors hover:bg-sky-500/20 dark:text-sky-300"><CalendarOff className="h-4 w-4" /> <span className="hidden sm:inline">Выходной</span></button>
                <button aria-label="Добавить запись" title="Добавить запись" onClick={onAddEntry} className="inline-flex items-center justify-center rounded-md bg-lime-500 p-2 text-slate-950 transition-colors hover:bg-lime-400"><Plus className="w-5 h-5" /></button>
            </div>
            <button type="button" onClick={onResetAccounting} className="mb-4 inline-flex items-center gap-2 rounded-lg border border-orange-500/30 bg-orange-500/5 px-3 py-2 text-xs font-semibold text-orange-600 transition-colors hover:bg-orange-500/10 dark:text-orange-400"><RotateCcw className="h-3.5 w-3.5" /> Новый финансовый старт</button>
            <WeeksConcept
                entries={ledger.entries}
                balance={ledger.balanceAtReference}
                statementHref={`/admin/tenant/${tenantId}/history/statement`}
                onEdit={onEditEntry}
            />
        </div>
    );
}
