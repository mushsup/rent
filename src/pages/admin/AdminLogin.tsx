import { useState, useEffect, type FormEvent } from 'react';
import { AlertCircle } from 'lucide-react';
import { signIn } from '../../features/auth/api';
import { getErrorMessage } from '../../shared/lib/errors';
import { useI18n } from '../../i18n';
import { LanguageToggle } from '../../i18n/LanguageToggle';

export default function AdminLogin() {
    const { t, language } = useI18n();
    useEffect(() => {
        document.title = t('Авторизация — E-Bike Admin');
    }, [language, t]);

    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');

    const handleLogin = async (e: FormEvent<HTMLFormElement>) => {
        e.preventDefault();
        setLoading(true);
        setError('');

        try {
            await signIn(email, password);
        } catch (caught) {
            const message = getErrorMessage(caught);
            if (/invalid login|invalid_grant|invalid email or password|email not confirmed/i.test(message)) {
                setError(t('Неверный логин или пароль'));
            } else if (/failed to fetch|network|load failed|could not connect/i.test(message)) {
                setError(t('Не удалось войти. Проверьте подключение и попробуйте снова.'));
            } else {
                setError(t(message));
            }
            setLoading(false);
        }
    };

    return (
        // Auth screen is intentionally always dark (standalone entry point,
        // separate from the themed admin UI): no dark: variants by design.
        <div className="min-h-screen flex items-center justify-center bg-slate-900 py-12 px-4 sm:px-6 lg:px-8">
            <div className="max-w-md w-full space-y-8 bg-slate-800 p-8 rounded-lg shadow-2xl border border-slate-700">
                <div className="text-center">
                    <h2 className="mt-6 text-3xl font-extrabold text-white">{t('Вход')}</h2>
                </div>
                <form className="mt-8 space-y-6" onSubmit={handleLogin}>
                    {error && (
                        <div className="rounded-md bg-red-900/50 p-4 border border-red-800">
                            <div className="flex">
                                <div className="flex-shrink-0">
                                    <AlertCircle className="h-5 w-5 text-red-400" aria-hidden="true" />
                                </div>
                                <div className="ml-3">
                                    <h3 className="text-sm font-medium text-red-200">{error}</h3>
                                </div>
                            </div>
                        </div>
                    )}
                    <div className="rounded-md shadow-sm space-y-4">
                        <div>
                            <label htmlFor="email-address" className="sr-only">{t('Email адрес')}</label>
                            <input
                                id="email-address"
                                name="email"
                                type="email"
                                autoComplete="email"
                                required
                                className="appearance-none relative block w-full px-3 py-2 bg-slate-700 border border-slate-600 placeholder-slate-400 text-white rounded-md focus:outline-none focus:ring-lime-500 focus:border-lime-500 sm:text-sm"
                                placeholder={t('Email адрес')}
                                value={email}
                                onChange={(e) => setEmail(e.target.value)}
                            />
                        </div>
                        <div>
                            <label htmlFor="password" className="sr-only">{t('Пароль')}</label>
                            <input
                                id="password"
                                name="password"
                                type="password"
                                autoComplete="current-password"
                                required
                                className="appearance-none relative block w-full px-3 py-2 bg-slate-700 border border-slate-600 placeholder-slate-400 text-white rounded-md focus:outline-none focus:ring-lime-500 focus:border-lime-500 sm:text-sm"
                                placeholder={t('Пароль')}
                                value={password}
                                onChange={(e) => setPassword(e.target.value)}
                            />
                        </div>
                    </div>

                    <div>
                        <button
                            type="submit"
                            disabled={loading}
                            className="group relative w-full flex justify-center py-2 px-4 border border-transparent text-sm font-semibold rounded-md text-slate-950 bg-lime-600 hover:bg-lime-500 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-lime-500 focus:ring-offset-slate-900 transition-colors disabled:opacity-50"
                        >
                            {loading ? t('Вход...') : t('Войти')}
                        </button>
                    </div>
                </form>
                <LanguageToggle className="pt-2 text-slate-400" />
            </div>
        </div>
    );
}
