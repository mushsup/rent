import { Component, type ErrorInfo, type ReactNode } from 'react';

interface Props { children: ReactNode }
interface State { hasError: boolean }

export default class ErrorBoundary extends Component<Props, State> {
    state: State = { hasError: false };

    static getDerivedStateFromError(_error: Error): State {
        return { hasError: true };
    }

    componentDidCatch(_error: Error, _info: ErrorInfo) {}

    render(): ReactNode {
        if (this.state.hasError) {
            return (
                <main className="min-h-screen bg-white dark:bg-zinc-900 flex items-center justify-center p-6 text-center text-zinc-900 dark:text-white">
                    <div>
                        <h1 className="text-2xl font-bold">Что-то пошло не так</h1>
                        <p className="mt-2 text-zinc-500 dark:text-zinc-400">Обновите страницу. Если ошибка повторится, проверьте подключение к базе данных.</p>
                        <button type="button" onClick={() => window.location.reload()} className="mt-5 rounded-md bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-700">
                            Обновить страницу
                        </button>
                    </div>
                </main>
            );
        }

        return this.props.children;
    }
}
