import { Component, type ReactNode } from 'react';
import { useI18n } from '../i18n';

interface Props { children: ReactNode }
interface State { hasError: boolean }

class ErrorBoundaryInner extends Component<Props & { title: string; description: string; reloadLabel: string }, State> {
    state: State = { hasError: false };

    static getDerivedStateFromError(_error: Error): State {
        return { hasError: true };
    }

    render(): ReactNode {
        if (this.state.hasError) {
            return (
                <main className="min-h-screen bg-slate-100 dark:bg-slate-950 flex items-center justify-center p-6 text-center text-slate-950 dark:text-white">
                    <div>
                        <h1 className="text-2xl font-bold">{this.props.title}</h1>
                        <p className="mt-2 text-slate-500 dark:text-slate-400">{this.props.description}</p>
                        <button type="button" onClick={() => window.location.reload()} className="mt-5 rounded-md bg-lime-600 px-4 py-2 text-sm font-semibold text-slate-950 hover:bg-lime-700">
                            {this.props.reloadLabel}
                        </button>
                    </div>
                </main>
            );
        }

        return this.props.children;
    }
}

export default function ErrorBoundary({ children }: Props) {
    const { t } = useI18n();
    return <ErrorBoundaryInner title={t('Что-то пошло не так')} description={t('Обновите страницу. Если ошибка повторится, проверьте подключение к базе данных.')} reloadLabel={t('Обновить страницу')}>{children}</ErrorBoundaryInner>;
}
