import { Outlet, useNavigate, useLocation } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { Bike, ListTodo, LogOut, Moon, Smartphone, Sun, Users, WalletCards, X } from 'lucide-react';
import { useEffect, useState } from 'react';
import type { Session } from '@supabase/supabase-js';
import { clearOfflineQueryCache } from '../shared/lib/offlineQueryCache';
import { useQueryClient } from '@tanstack/react-query';
import { SiteVersion } from '../shared/ui/SiteVersion';
import AdminLogin from '../pages/admin/AdminLogin';

export default function Layout() {
    const location = useLocation();
    useEffect(() => {
        document.title = "Панель управления — E-Bike Admin";
    }, []);

    const [session, setSession] = useState<Session | null>(null);
    const [loading, setLoading] = useState(true);
    const navigate = useNavigate();
    const queryClient = useQueryClient();

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
        } = supabase.auth.onAuthStateChange((event, session) => {
            if (event === 'SIGNED_OUT') {
                queryClient.clear();
                void clearOfflineQueryCache();
            }
            if (active) setSession(session);
        });

        return () => {
            active = false;
            subscription.unsubscribe();
        };
    }, [queryClient]);

    const [isDark, setIsDark] = useState(() => {
        const storedTheme = localStorage.getItem('theme');
        return storedTheme !== 'light';
    });
    const [isMobilePreviewOpen, setIsMobilePreviewOpen] = useState(false);

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

    useEffect(() => {
        if (!isMobilePreviewOpen) return;

        const closeOnEscape = (event: KeyboardEvent) => {
            if (event.key === 'Escape') setIsMobilePreviewOpen(false);
        };

        window.addEventListener('keydown', closeOnEscape);
        return () => window.removeEventListener('keydown', closeOnEscape);
    }, [isMobilePreviewOpen]);

    if (loading) return <div role="status" aria-label="Проверка сессии" className="min-h-screen bg-slate-100 p-4 dark:bg-slate-950 sm:p-6"><div className="mx-auto max-w-7xl animate-pulse"><div className="h-14 rounded-lg bg-white/70 dark:bg-slate-900/70" /><div className="mt-6 h-10 w-48 rounded-lg bg-white/70 dark:bg-slate-900/70" /><div className="mt-6 h-24 rounded-lg bg-white/70 dark:bg-slate-900/70" /></div></div>;

    if (!session) {
        return <AdminLogin />;
    }

    const handleLogout = async () => {
        queryClient.clear();
        await clearOfflineQueryCache();
        await supabase.auth.signOut();
        navigate('/');
    };

    const navigation = [
        { label: 'Клиенты', legacyLabel: 'Арендаторы', path: '/', icon: Users, exact: true },
        { label: 'Велосипеды', legacyLabel: 'Велосипеды', path: '/bikes', icon: Bike },
        { label: 'Платежи', legacyLabel: 'Платежи', path: '/payments', icon: WalletCards },
        { label: 'Задачи', legacyLabel: 'Задачи', path: '/tasks', icon: ListTodo },
    ];

    const isActive = (path: string, exact = false) => exact
        ? location.pathname === path
        : location.pathname === path || location.pathname.startsWith(`${path}/`);

    return (
        <div className="min-h-screen bg-slate-100 dark:bg-slate-950 flex flex-col font-sans text-slate-950 dark:text-slate-100">
            <header className="sticky top-0 z-40 h-14 border-b border-slate-200 bg-slate-50/95 backdrop-blur dark:border-slate-800 dark:bg-slate-950/95">
                <div className="mx-auto flex h-full max-w-7xl items-center justify-between gap-2 px-4 sm:px-6">
                    <button type="button" onClick={() => navigate('/')} aria-label="На главную — клиенты" className="flex min-w-0 items-center gap-2 md:hidden">
                        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-lime-300 text-slate-950"><Bike className="h-4 w-4" /></span>
                        <span className="truncate text-sm font-black tracking-tight">Rent Ops</span>
                    </button>
                    <nav className="hidden items-center gap-1 md:flex" aria-label="Основная навигация">
                        {navigation.map(item => <button key={item.path} onClick={() => navigate(item.path)} className={`${isActive(item.path, item.exact) ? 'bg-lime-300 text-slate-950 shadow-sm dark:bg-lime-300' : 'text-slate-600 hover:bg-slate-200/70 hover:text-slate-950 dark:text-slate-300 dark:hover:bg-slate-800 dark:hover:text-white'} h-8 whitespace-nowrap rounded-md px-3 text-sm font-medium transition-colors`}>{item.legacyLabel}</button>)}
                    </nav>
                    <div className="flex items-center gap-2">
                        <button
                            type="button"
                            onClick={toggleTheme}
                            aria-label={isDark ? 'Включить светлую тему' : 'Включить тёмную тему'}
                            aria-pressed={isDark}
                            title="Переключить тему"
                        >
                            {isDark ? <Sun className="w-4 h-4 sm:w-5 sm:h-5 flex-shrink-0" /> : <Moon className="w-4 h-4 sm:w-5 sm:h-5 flex-shrink-0" />}
                        </button>
                        <button
                            type="button"
                            onClick={() => setIsMobilePreviewOpen(true)}
                            className="hidden h-8 w-8 items-center justify-center rounded-md border border-slate-200 bg-white p-2 text-slate-700 transition-colors hover:bg-slate-100 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-white md:flex"
                            title="Предпросмотр на CMF Phone 2 Pro"
                            aria-label="Открыть предпросмотр на CMF Phone 2 Pro"
                        >
                            <Smartphone className="h-4 w-4 shrink-0" />
                        </button>
                        <button
                            type="button"
                            onClick={handleLogout}
                            aria-label="Выйти"
                            className="flex h-8 items-center justify-center rounded-md border border-slate-200 bg-white px-2 text-slate-700 transition-colors hover:bg-red-50 hover:text-red-700 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-400 dark:hover:bg-red-950/40 dark:hover:text-red-300"
                            title="Выйти"
                        >
                            <LogOut className="w-4 h-4 sm:w-5 sm:h-5 flex-shrink-0" />
                            <span className="hidden sm:inline ml-2 text-sm">Выйти</span>
                        </button>
                    </div>
                </div>
            </header>
            <main className="mx-auto w-full max-w-7xl flex-1 px-3 pb-24 pt-4 sm:px-6 sm:py-8 md:pb-8 lg:px-8">
                <Outlet />
            </main>
            <footer className="pt-2 md:pb-4">
                <SiteVersion />
            </footer>
            <nav className="fixed inset-x-0 bottom-0 z-40 border-t border-slate-200 bg-white/95 px-1 pb-[max(0.35rem,env(safe-area-inset-bottom))] pt-1 backdrop-blur dark:border-slate-800 dark:bg-slate-950/95 md:hidden" aria-label="Мобильная навигация">
                <div className="mx-auto grid max-w-lg grid-cols-4">
                    {navigation.map(item => {
                        const Icon = item.icon;
                        const active = isActive(item.path, item.exact);
                        return <button key={item.path} type="button" onClick={() => navigate(item.path)} aria-current={active ? 'page' : undefined} className={`flex min-h-14 flex-col items-center justify-center gap-1 rounded-lg px-1 text-[10px] font-bold transition-colors ${active ? 'bg-lime-300/20 text-lime-800 dark:text-lime-300' : 'text-slate-500 dark:text-slate-400'}`}><Icon className="h-5 w-5" /><span className="max-w-full truncate">{item.label}</span></button>;
                    })}
                </div>
            </nav>
            {isMobilePreviewOpen && <div className="fixed inset-0 z-50 hidden items-center justify-center bg-slate-950/70 p-6 backdrop-blur-sm md:flex" role="dialog" aria-modal="true" aria-label="Предпросмотр на CMF Phone 2 Pro" onMouseDown={(event) => { if (event.target === event.currentTarget) setIsMobilePreviewOpen(false); }}>
                <div className="relative rounded-[2.5rem] border-[10px] border-slate-950 bg-slate-950 p-1 shadow-2xl dark:border-slate-700">
                    <div className="absolute left-1/2 top-2 z-10 h-5 w-24 -translate-x-1/2 rounded-full bg-slate-950 dark:bg-slate-700" aria-hidden="true" />
                    <button type="button" onClick={() => setIsMobilePreviewOpen(false)} className="absolute -right-12 top-0 flex h-9 w-9 items-center justify-center rounded-full bg-white text-slate-700 shadow-lg transition-colors hover:bg-slate-100" aria-label="Закрыть предпросмотр" title="Закрыть">
                        <X className="h-5 w-5" />
                    </button>
                    <iframe key={location.key} src={window.location.href} title="CMF Phone 2 Pro" className="block h-[min(82vh,873px)] w-[393px] rounded-[1.85rem] bg-slate-100" />
                    <p className="absolute left-1/2 top-full mt-3 -translate-x-1/2 whitespace-nowrap text-xs font-medium text-white">CMF Phone 2 Pro · 393 px</p>
                </div>
            </div>}
        </div>
    );
}
