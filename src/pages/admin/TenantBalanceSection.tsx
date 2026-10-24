import { Check, Flag, Plus, Repeat2 } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { format } from 'date-fns';
import { enUS, ru } from 'date-fns/locale';
import { buildPaymentLedger } from '../../utils/paymentLedger';
import { formatZl } from '../../shared/lib/money';
import { StatementConcept } from './PaymentHistory';
import type { RentalEvent } from '../../types';
import { useI18n } from '../../i18n';

type PaymentLedger = ReturnType<typeof buildPaymentLedger>;
type LedgerEntry = PaymentLedger['entries'][number];

interface TenantBalanceSectionProps {
    ledger: PaymentLedger;
    onAddEntry: () => void;
    onEditEntry: (entry: LedgerEntry) => void;
    onEditRentalEnd: (event: RentalEvent) => void;
    onApproveCharge: (chargeId: string) => void;
    canFinishRental: boolean;
    onFinishRental: () => void;
}

export function TenantBalanceSection({ ledger, onAddEntry, onEditEntry, onEditRentalEnd, onApproveCharge, canFinishRental, onFinishRental }: TenantBalanceSectionProps) {
    const { language, t } = useI18n();
    const [menuOpen, setMenuOpen] = useState(false);
    const menuRef = useRef<HTMLDivElement>(null);
    const recurringEntry = ledger.entries.find(entry => entry.type === 'expected' && entry.isAutomatic);

    useEffect(() => {
        if (!menuOpen) return;
        const closeOnEscape = (event: KeyboardEvent) => { if (event.key === 'Escape') setMenuOpen(false); };
        const closeOnOutsideClick = (event: globalThis.MouseEvent) => {
            if (menuRef.current && !menuRef.current.contains(event.target as Node)) setMenuOpen(false);
        };
        document.addEventListener('keydown', closeOnEscape);
        document.addEventListener('mousedown', closeOnOutsideClick);
        return () => {
            document.removeEventListener('keydown', closeOnEscape);
            document.removeEventListener('mousedown', closeOnOutsideClick);
        };
    }, [menuOpen]);
    return (
        <div className="md:col-span-2 bg-white dark:bg-slate-900 rounded-lg shadow border border-slate-200 dark:border-slate-800 p-4 sm:p-6">
            <div className="mb-4 flex flex-wrap items-center gap-3">
                <h3 className="flex items-center gap-2 text-lg font-medium text-slate-900 dark:text-white">{t('Баланс')} {recurringEntry && <span className="inline-flex items-center gap-1.5 text-xs font-bold text-slate-500 dark:text-slate-400"><Repeat2 className="h-3.5 w-3.5" />{format(recurringEntry.date, 'EEEE', { locale: language === 'ru' ? ru : enUS })}</span>}</h3>
                <div className={`ml-auto flex items-center gap-1 text-base font-bold tabular-nums ${ledger.balanceAtReference > 0 ? 'text-red-700 dark:text-red-400' : 'text-lime-800 dark:text-lime-300'}`}>
                    {ledger.balanceAtReference > 0
                        ? formatZl(ledger.balanceAtReference)
                        : ledger.creditAtReference > 0
                            ? `${t('аванс')} ${formatZl(ledger.creditAtReference)}`
                            : '0 zł'}
                    {ledger.balanceAtReference <= 0 && <Check className="h-4 w-4" />}
                </div>
                <div className="relative" ref={menuRef}>
                    <button type="button" aria-label={t('Добавить или изменить баланс')} aria-haspopup="menu" aria-expanded={menuOpen} title={t('Добавить')} onClick={() => setMenuOpen(current => !current)} className="inline-flex min-h-10 min-w-10 items-center justify-center rounded-md bg-lime-500 p-2 text-slate-950 transition-colors hover:bg-lime-400"><Plus className="w-5 h-5" /></button>
                    {menuOpen && <div role="menu" className="absolute right-0 top-full z-20 mt-2 w-56 rounded-lg border border-slate-200 bg-white p-1 shadow-xl dark:border-slate-700 dark:bg-slate-900">
                        <button type="button" role="menuitem" onClick={() => { setMenuOpen(false); onAddEntry(); }} className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-left text-sm text-slate-700 hover:bg-slate-100 dark:text-slate-200 dark:hover:bg-slate-800"><Plus className="h-4 w-4" />{t('Добавить запись')}</button>
                        {canFinishRental && <button type="button" role="menuitem" onClick={() => { setMenuOpen(false); onFinishRental(); }} className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-left text-sm text-slate-700 hover:bg-slate-100 dark:text-slate-200 dark:hover:bg-slate-800"><Flag className="h-4 w-4" />{t('Завершить аренду')}</button>}
                    </div>}
                </div>
            </div>
            <StatementConcept entries={ledger.entries} onEdit={onEditEntry} onEditRentalEnd={onEditRentalEnd} onApprove={onApproveCharge} showChart emptyAction={<button type="button" onClick={onAddEntry} className="mt-4 rounded-md bg-lime-500 px-4 py-2 text-sm font-semibold text-slate-950 hover:bg-lime-400">{t('Добавить запись')}</button>} />
        </div>
    );
}
