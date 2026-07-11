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

    if (loading) return <div className="min-h-screen bg-white dark:bg-gray-900 flex items-center justify-center text-gray-900 dark:text-white">Загрузка...</div>;

    if (!session) {
        return <Navigate to="/admin/login" replace />;
    }

    const handleLogout = async () => {
        await supabase.auth.signOut();
        navigate('/admin/login');
    };

    return (
        <div className="min-h-screen bg-white dark:bg-gray-900 flex flex-col font-sans text-gray-800 dark:text-gray-100">
            <header className="bg-white dark:bg-gray-800 shadow-md border-b border-gray-200 dark:border-gray-700 sticky top-0 z-40">
                <div className="max-w-7xl mx-auto px-4 py-3 flex flex-row justify-between items-center gap-2">
                    <div className="flex items-center space-x-2 sm:space-x-6">
                        <div className="flex items-center text-indigo-600 dark:text-indigo-400 mr-3">
                            <Bike className="w-7 h-7 flex-shrink-0" />
                            <h1 className="ml-2 text-lg font-bold text-gray-900 dark:text-white hidden lg:block">E-Bike</h1>
                        </div>
                        <nav className="flex space-x-1">
                            <button
                                onClick={() => navigate('/admin')}
                                className={`${location.pathname === '/admin' ? 'bg-indigo-600 text-white shadow-sm' : 'text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:bg-gray-700 hover:text-gray-900 dark:text-white'} px-2 sm:px-3 py-1.5 rounded-md text-xs sm:text-sm font-medium transition-colors whitespace-nowrap`}
                            >
                                Арендаторы
                            </button>
                            <button
                                onClick={() => navigate('/admin/bikes')}
                                className={`${location.pathname === '/admin/bikes' ? 'bg-indigo-600 text-white shadow-sm' : 'text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:bg-gray-700 hover:text-gray-900 dark:text-white'} px-2 sm:px-3 py-1.5 rounded-md text-xs sm:text-sm font-medium transition-colors whitespace-nowrap`}
                            >
                                Велосипеды
                            </button>
                            <button
                                onClick={() => navigate('/admin/payments')}
                                className={`${location.pathname === '/admin/payments' ? 'bg-indigo-600 text-white shadow-sm' : 'text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:bg-gray-700 hover:text-gray-900 dark:text-white'} px-2 sm:px-3 py-1.5 rounded-md text-xs sm:text-sm font-medium transition-colors whitespace-nowrap`}
                            >
                                Платежи
                            </button>
                        </nav>
                    </div>
                    <div className="flex items-center gap-2">
                        <button
                            onClick={toggleTheme}
                            className="flex items-center justify-center bg-gray-100/50 dark:bg-gray-700/50 hover:bg-gray-200 dark:hover:bg-gray-600 border border-gray-200 dark:border-gray-600/50 p-2 rounded-md transition-colors text-gray-700 dark:text-gray-400 dark:hover:text-white"
                            title="Переключить тему"
                        >
                            {isDark ? <Sun className="w-4 h-4 sm:w-5 sm:h-5 flex-shrink-0" /> : <Moon className="w-4 h-4 sm:w-5 sm:h-5 flex-shrink-0" />}
                        </button>
                        <button
                            onClick={handleLogout}
                            className="flex items-center justify-center text-gray-700 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white transition-colors bg-gray-100/50 dark:bg-gray-700/50 hover:bg-red-100 dark:hover:bg-red-900/40 p-2 rounded-md border border-gray-200 dark:border-gray-600/50"
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
