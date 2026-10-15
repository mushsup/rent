import { CalendarDays } from 'lucide-react';
import type { InputHTMLAttributes } from 'react';

interface DateInputProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'type' | 'value' | 'onChange' | 'max'> {
    value: string;
    onChange: (value: string) => void;
    max?: string;
}

function displayDate(value: string): string {
    return /^\d{4}-\d{2}-\d{2}$/.test(value) ? `${value.slice(8, 10)}.${value.slice(5, 7)}.${value.slice(2, 4)}` : '';
}

export function DateInput({ value, onChange, max, placeholder = 'ДД.ММ.ГГ', ...props }: DateInputProps) {
    const { id, className = '', disabled, required, name, 'aria-label': ariaLabel, ...textInputProps } = props;

    return <span className="relative block">
        <input {...textInputProps} type="text" autoComplete="off" placeholder={placeholder} value={displayDate(value)} readOnly aria-hidden="true" tabIndex={-1} className={`${className} pr-10`} />
        <span aria-hidden="true" className="pointer-events-none absolute right-1 top-1/2 z-10 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-md bg-slate-200 text-slate-500 dark:bg-slate-700/60 dark:text-white"><CalendarDays className="h-4 w-4" /></span>
        <input id={id} name={name} type="date" required={required} disabled={disabled} max={max} value={value} onChange={event => { if (!max || event.target.value <= max) onChange(event.target.value); }} className="absolute inset-0 z-20 h-full w-full cursor-pointer opacity-0 disabled:cursor-not-allowed" aria-label={ariaLabel || placeholder} />
    </span>;
}
