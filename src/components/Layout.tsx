import { Outlet, Navigate, useNavigate, useLocation } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { LogOut, Sun, Moon } from 'lucide-react';
import { useEffect, useState } from 'react';
import type { Session } from '@supabase/supabase-js';

export default function Layout() {
    const location = useLocation();
    useEffect(() => {
        document.title = "Панель управления — E-Bike Admin";
    }, []);

    const [session, setSession] = useState<Session | null>(null);
    const [loading, setLoading] = useState(true);
    const navigate = useNavigate();

    useEffect(() => {
        let active = true;
        supabase.auth.getSession()
            .then(({ data: { session } }) => {
                if (active) setSession(session);
            })
            .catch(() => {
                if (active) setSession(null);
            })
            .finally(() => {
                if (active) setLoading(false);
            });

        const {
            data: { subscription },
        } = supabase.auth.onAuthStateChange((_event, session) => {
            if (active) setSession(session);
        });

        return () => {
            active = false;
            subscription.unsubscribe();
        };
    }, []);

    const [isDark, setIsDark] = useState(() => {
        const storedTheme = localStorage.getItem('theme');
        return storedTheme !== 'light';
    });

    useEffect(() => {
        if (isDark) {
            document.documentElement.classList.add('dark');
        } else {
            document.documentElement.classList.remove('dark');
        }
    }, [isDark]);

    const toggleTheme = () => {
        const nextTheme = !isDark;
        setIsDark(nextTheme);
        localStorage.setItem('theme', nextTheme ? 'dark' : 'light');
    };

    if (loading) return <div className="min-h-screen bg-slate-100 dark:bg-slate-950 flex items-center justify-center text-slate-950 dark:text-white">Загрузка...</div>;

    if (!session) {
        return <Navigate to="/admin/login" replace />;
    }

    const handleLogout = async () => {
        await supabase.auth.signOut();
        navigate('/admin/login');
    };

    return (
        <div className="min-h-screen bg-slate-100 dark:bg-slate-950 flex flex-col font-sans text-slate-950 dark:text-slate-100">
            <header className="sticky top-0 z-40 h-14 border-b border-slate-200 bg-slate-50 dark:border-slate-800 dark:bg-slate-950">
                <div className="max-w-7xl mx-auto h-full px-4 sm:px-6 flex flex-row justify-between items-center gap-2">
                    <div className="flex items-center">
                        <nav className="flex space-x-1">
                            <button
                                onClick={() => navigate('/admin')}
                                className={`${location.pathname === '/admin' ? 'bg-lime-300 text-slate-950 shadow-sm dark:bg-lime-300' : 'text-slate-600 hover:bg-slate-200/70 hover:text-slate-950 dark:text-slate-300 dark:hover:bg-slate-800 dark:hover:text-white'} px-2 sm:px-3 h-8 rounded-md text-xs sm:text-sm font-medium transition-colors whitespace-nowrap`}
                            >
                                Арендаторы
                            </button>
                            <button
                                onClick={() => navigate('/admin/bikes')}
                                className={`${location.pathname === '/admin/bikes' ? 'bg-lime-300 text-slate-950 shadow-sm dark:bg-lime-300' : 'text-slate-600 hover:bg-slate-200/70 hover:text-slate-950 dark:text-slate-300 dark:hover:bg-slate-800 dark:hover:text-white'} px-2 sm:px-3 h-8 rounded-md text-xs sm:text-sm font-medium transition-colors whitespace-nowrap`}
                            >
                                Велосипеды
                            </button>
                            <button
                                onClick={() => navigate('/admin/payments')}
                                className={`${location.pathname === '/admin/payments' ? 'bg-lime-300 text-slate-950 shadow-sm dark:bg-lime-300' : 'text-slate-600 hover:bg-slate-200/70 hover:text-slate-950 dark:text-slate-300 dark:hover:bg-slate-800 dark:hover:text-white'} px-2 sm:px-3 h-8 rounded-md text-xs sm:text-sm font-medium transition-colors whitespace-nowrap`}
                            >
                                Платежи
                            </button>
                            <button
                                onClick={() => navigate('/admin/tasks')}
                                className={`${location.pathname === '/admin/tasks' ? 'bg-lime-300 text-slate-950 shadow-sm dark:bg-lime-300' : 'text-slate-600 hover:bg-slate-200/70 hover:text-slate-950 dark:text-slate-300 dark:hover:bg-slate-800 dark:hover:text-white'} px-2 sm:px-3 h-8 rounded-md text-xs sm:text-sm font-medium transition-colors whitespace-nowrap`}
                            >
                                Задачи
                            </button>
                        </nav>
                    </div>
                    <div className="flex items-center gap-2">
                        <button
                            onClick={toggleTheme}
                            className="flex h-8 w-8 items-center justify-center rounded-md border border-slate-200 bg-white p-2 text-slate-700 transition-colors hover:bg-slate-100 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-white"
                            title="Переключить тему"
                        >
                            {isDark ? <Sun className="w-4 h-4 sm:w-5 sm:h-5 flex-shrink-0" /> : <Moon className="w-4 h-4 sm:w-5 sm:h-5 flex-shrink-0" />}
                        </button>
                        <button
                            onClick={handleLogout}
                            className="flex h-8 items-center justify-center rounded-md border border-slate-200 bg-white px-2 text-slate-700 transition-colors hover:bg-red-50 hover:text-red-700 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-400 dark:hover:bg-red-950/40 dark:hover:text-red-300"
                            title="Выйти"
                        >
                            <LogOut className="w-4 h-4 sm:w-5 sm:h-5 flex-shrink-0" />
                            <span className="hidden sm:inline ml-2 text-sm">Выйти</span>
                        </button>
                    </div>
                </div>
            </header>
            <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-8">
                <Outlet />
            </main>
        </div>
    );
}
