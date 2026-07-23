import { Outlet, Navigate, useNavigate, useLocation } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { LogOut, Bike, Sun, Moon } from 'lucide-react';
import { useEffect, useState } from 'react';

export default function Layout() {
    const location = useLocation();
    useEffect(() => {
        document.title = "Панель управления — E-Bike Admin";
    }, []);

    const [session, setSession] = useState(null);
    const [loading, setLoading] = useState(true);
    const navigate = useNavigate();

    useEffect(() => {
        supabase.auth.getSession().then(({ data: { session } }) => {
            setSession(session);
            setLoading(false);
        });

        const {
            data: { subscription },
        } = supabase.auth.onAuthStateChange((_event, session) => {
            setSession(session);
        });

        return () => subscription.unsubscribe();
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

    if (loading) return <div className="min-h-screen bg-zinc-100 dark:bg-zinc-950 flex items-center justify-center text-zinc-950 dark:text-white">Загрузка...</div>;

    if (!session) {
        return <Navigate to="/admin/login" replace />;
    }

    const handleLogout = async () => {
        await supabase.auth.signOut();
        navigate('/admin/login');
    };

    return (
        <div className="min-h-screen bg-zinc-100 dark:bg-zinc-950 flex flex-col font-sans text-zinc-950 dark:text-zinc-100">
            <header className="sticky top-0 z-40 border-b border-zinc-200/80 bg-zinc-50/85 backdrop-blur-xl dark:border-zinc-800/80 dark:bg-zinc-950/85">
                <div className="max-w-7xl mx-auto px-4 py-3 flex flex-row justify-between items-center gap-2">
                    <div className="flex items-center space-x-2 sm:space-x-6">
                        <div className="flex items-center text-lime-600 dark:text-lime-400 mr-3">
                            <Bike className="w-7 h-7 flex-shrink-0" />
                            <h1 className="ml-2 text-lg font-bold text-zinc-900 dark:text-white hidden lg:block">E-Bike</h1>
                        </div>
                        <nav className="flex space-x-1">
                            <button
                                onClick={() => navigate('/admin')}
                                className={`${location.pathname === '/admin' ? 'bg-lime-300 text-zinc-950 shadow-sm dark:bg-lime-300' : 'text-zinc-600 hover:bg-zinc-200/70 hover:text-zinc-950 dark:text-zinc-300 dark:hover:bg-zinc-800 dark:hover:text-white'} px-2 sm:px-3 py-1.5 rounded-lg text-xs sm:text-sm font-medium transition-colors whitespace-nowrap`}
                            >
                                Арендаторы
                            </button>
                            <button
                                onClick={() => navigate('/admin/bikes')}
                                className={`${location.pathname === '/admin/bikes' ? 'bg-lime-300 text-zinc-950 shadow-sm dark:bg-lime-300' : 'text-zinc-600 hover:bg-zinc-200/70 hover:text-zinc-950 dark:text-zinc-300 dark:hover:bg-zinc-800 dark:hover:text-white'} px-2 sm:px-3 py-1.5 rounded-lg text-xs sm:text-sm font-medium transition-colors whitespace-nowrap`}
                            >
                                Велосипеды
                            </button>
                            <button
                                onClick={() => navigate('/admin/payments')}
                                className={`${location.pathname === '/admin/payments' ? 'bg-lime-300 text-zinc-950 shadow-sm dark:bg-lime-300' : 'text-zinc-600 hover:bg-zinc-200/70 hover:text-zinc-950 dark:text-zinc-300 dark:hover:bg-zinc-800 dark:hover:text-white'} px-2 sm:px-3 py-1.5 rounded-lg text-xs sm:text-sm font-medium transition-colors whitespace-nowrap`}
                            >
                                Платежи
                            </button>
                        </nav>
                    </div>
                    <div className="flex items-center gap-2">
                        <button
                            onClick={toggleTheme}
                            className="flex items-center justify-center rounded-lg border border-zinc-200 bg-white/70 p-2 text-zinc-700 transition-colors hover:bg-white dark:border-zinc-800 dark:bg-zinc-900/70 dark:text-zinc-400 dark:hover:bg-zinc-800 dark:hover:text-white"
                            title="Переключить тему"
                        >
                            {isDark ? <Sun className="w-4 h-4 sm:w-5 sm:h-5 flex-shrink-0" /> : <Moon className="w-4 h-4 sm:w-5 sm:h-5 flex-shrink-0" />}
                        </button>
                        <button
                            onClick={handleLogout}
                            className="flex items-center justify-center rounded-lg border border-zinc-200 bg-white/70 p-2 text-zinc-700 transition-colors hover:bg-red-50 hover:text-red-700 dark:border-zinc-800 dark:bg-zinc-900/70 dark:text-zinc-400 dark:hover:bg-red-950/40 dark:hover:text-red-300"
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
