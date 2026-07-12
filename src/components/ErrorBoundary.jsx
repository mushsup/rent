import { Component } from 'react';

export default class ErrorBoundary extends Component {
    state = { hasError: false };

    static getDerivedStateFromError() {
        return { hasError: true };
    }

    render() {
        if (this.state.hasError) {
            return (
                <main className="min-h-screen bg-white dark:bg-gray-900 flex items-center justify-center p-6 text-center text-gray-900 dark:text-white">
                    <div>
                        <h1 className="text-2xl font-bold">Что-то пошло не так</h1>
                        <p className="mt-2 text-gray-500 dark:text-gray-400">Обновите страницу. Если ошибка повторится, проверьте подключение к базе данных.</p>
                        <button type="button" onClick={() => window.location.reload()} className="mt-5 rounded-md bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700">
                            Обновить страницу
                        </button>
                    </div>
                </main>
            );
        }

        // eslint-disable-next-line react/prop-types
        return this.props.children;
    }
}
