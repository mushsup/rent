import { useEffect, useId, type ButtonHTMLAttributes, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes, type TextareaHTMLAttributes } from 'react';
import { X } from 'lucide-react';
import { twMerge } from 'tailwind-merge';

type ButtonVariant = 'primary' | 'secondary' | 'danger' | 'ghost';

const buttonVariants: Record<ButtonVariant, string> = {
  primary: 'bg-lime-600 text-slate-950 hover:bg-lime-700',
  secondary: 'bg-slate-200 text-slate-800 hover:bg-slate-300 dark:bg-slate-700 dark:text-slate-100 dark:hover:bg-slate-600',
  danger: 'bg-red-600 text-white hover:bg-red-700',
  ghost: 'text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800',
};

export function Button({ className, variant = 'primary', children, ...props }: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: ButtonVariant }) {
  return <button className={twMerge('inline-flex min-h-10 items-center justify-center gap-2 rounded-md px-4 py-2 text-sm font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-lime-500 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60 dark:focus-visible:ring-offset-slate-950', buttonVariants[variant], className)} {...props}>{children}</button>;
}

export function IconButton({ label, className, ...props }: ButtonHTMLAttributes<HTMLButtonElement> & { label: string }) {
  return <button type="button" aria-label={label} title={label} className={twMerge('inline-flex h-10 w-10 items-center justify-center rounded-md text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-lime-500 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-white', className)} {...props} />;
}

const fieldClass = 'w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 outline-none placeholder:text-slate-500 focus:border-lime-600 focus:ring-2 focus:ring-lime-500/30 disabled:opacity-60 dark:border-slate-700 dark:bg-slate-950 dark:text-white dark:placeholder:text-slate-400';

export function Input({ className, ...props }: InputHTMLAttributes<HTMLInputElement>) {
  return <input className={twMerge(fieldClass, className)} {...props} />;
}

export function Textarea({ className, ...props }: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea className={twMerge(fieldClass, 'resize-y', className)} {...props} />;
}

export function Select({ className, ...props }: SelectHTMLAttributes<HTMLSelectElement>) {
  return <select className={twMerge(fieldClass, className)} {...props} />;
}

export function Card({ className, children }: { className?: string; children: ReactNode }) {
  return <section className={twMerge('overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900', className)}>{children}</section>;
}

export function Badge({ className, children }: { className?: string; children: ReactNode }) {
  return <span className={twMerge('inline-flex rounded px-2 py-0.5 text-xs font-semibold', className)}>{children}</span>;
}

export function PageHeader({ title, description, actions }: { title: string; description?: string; actions?: ReactNode }) {
  return <header className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between"><div><h1 className="text-2xl font-bold text-slate-950 dark:text-white">{title}</h1>{description && <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">{description}</p>}</div>{actions}</header>;
}

export function LoadingState({ label = 'Загрузка...' }: { label?: string }) {
  return <div role="status" className="px-6 py-10 text-center text-sm text-slate-600 dark:text-slate-400">{label}</div>;
}

export function EmptyState({ title, action }: { title: string; action?: ReactNode }) {
  return <div className="px-6 py-14 text-center"><p className="text-sm text-slate-600 dark:text-slate-400">{title}</p>{action}</div>;
}

export function ErrorState({ message, retry }: { message: string; retry?: () => void }) {
  return <div role="alert" className="rounded-lg border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-800 dark:bg-red-950/30 dark:text-red-300"><p>{message}</p>{retry && <Button variant="secondary" className="mt-3" onClick={retry}>Повторить</Button>}</div>;
}

export function Dialog({ open, title, ariaLabel, size = 'lg', className, onClose, children, footer }: { open: boolean; title?: string; ariaLabel?: string; size?: 'sm' | 'md' | 'lg'; className?: string; onClose: () => void; children: ReactNode; footer?: ReactNode }) {
  const titleId = useId();

  useEffect(() => {
    if (!open) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [open, onClose]);

  if (!open) return null;
  const sizeClass = { sm: 'max-w-sm', md: 'max-w-md', lg: 'max-w-lg' }[size];
  return <div className="fixed inset-0 z-50 flex items-center justify-center p-4" role="presentation">
    <button type="button" aria-label="Закрыть диалог" className="absolute inset-0 cursor-default bg-slate-950/75 backdrop-blur-sm" onClick={onClose} />
    <section role="dialog" aria-modal="true" {...(title ? { 'aria-labelledby': titleId } : { 'aria-label': ariaLabel || 'Диалог' })} className={twMerge('relative max-h-[90vh] w-full overflow-y-auto rounded-lg border border-slate-200 bg-white p-6 shadow-2xl dark:border-slate-800 dark:bg-slate-900', sizeClass, className)}>
      {title && <div className="mb-4 flex items-center justify-between gap-4"><h2 id={titleId} className="text-lg font-bold text-slate-950 dark:text-white">{title}</h2><IconButton label="Закрыть" onClick={onClose}><X className="h-5 w-5" /></IconButton></div>}
      {children}
      {footer && <div className="mt-6 flex justify-end gap-2">{footer}</div>}
    </section>
  </div>;
}

export function ConfirmDialog({ open, title, description, confirmLabel = 'Удалить', confirmVariant = 'danger', busy = false, onCancel, onConfirm }: { open: boolean; title: string; description: string; confirmLabel?: string; confirmVariant?: ButtonVariant; busy?: boolean; onCancel: () => void; onConfirm: () => void }) {
  return <Dialog open={open} title={title} onClose={onCancel} footer={<><Button variant="secondary" onClick={onCancel} disabled={busy}>Отмена</Button><Button variant={confirmVariant} onClick={onConfirm} disabled={busy}>{busy ? 'Выполняется...' : confirmLabel}</Button></>}>
    <p className="text-sm text-slate-600 dark:text-slate-300">{description}</p>
  </Dialog>;
}
