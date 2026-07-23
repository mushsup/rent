import { Bike, Send, ShieldCheck, Zap, Navigation } from 'lucide-react';

export default function Home() {
    return (
        <div className="min-h-screen bg-zinc-900 text-white font-sans selection:bg-emerald-500/30">
            {/* Header / Nav */}
            <header className="fixed top-0 w-full z-50 bg-zinc-900/60 backdrop-blur-xl border-b border-zinc-800/50 animate-fade-in-up">
                <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
                    <div className="flex items-center gap-2">
                        <Bike className="w-6 h-6 text-emerald-500 animate-pulse" />
                        <span className="text-xl font-bold tracking-tight">E-Bike Rent <span className="text-emerald-500 relative inline-block"><span className="relative z-10">Krakow</span><span className="absolute inset-x-0 bottom-0 h-2 bg-emerald-500/20 blur-sm"></span></span></span>
                    </div>
                </div>
            </header>

            {/* Background glowing effects */}
            <div className="fixed inset-0 overflow-hidden pointer-events-none z-0">
                <div className="absolute -top-40 -right-40 w-96 h-96 bg-emerald-600/20 rounded-full blur-[100px]"></div>
                <div className="absolute top-1/2 -left-40 w-96 h-96 bg-cyan-600/10 rounded-full blur-[100px]"></div>
            </div>

            {/* Hero Section */}
            <main className="relative z-10">
                <div className="relative pt-32 pb-20 sm:pt-40 sm:pb-24">
                    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 text-center animate-fade-in-up delay-100">
                        <h1 className="text-4xl sm:text-6xl font-extrabold tracking-tight mb-6">
                            Аренда электровелосипедов <br className="hidden sm:block" />
                            <span className="text-transparent bg-clip-text bg-gradient-to-r from-emerald-400 to-cyan-400">для курьеров в Кракове</span>
                        </h1>
                        <p className="mt-4 text-xl text-zinc-400 max-w-2xl mx-auto leading-relaxed">
                            Надежные электровелосипеды с большим запасом хода. Идеально подходят для работы в Glovo, Uber Eats, Wolt и Bolt Food.
                        </p>

                        <div className="mt-10 flex flex-col sm:flex-row gap-4 justify-center items-center animate-fade-in-up delay-200">
                            <a href="https://t.me/wlad_rent" target="_blank" rel="noopener noreferrer"
                                className="relative group inline-flex items-center px-8 py-3 rounded-full bg-emerald-600 text-white font-medium transition-all hover:scale-105 overflow-hidden">
                                <span className="absolute inset-0 bg-gradient-to-r from-emerald-500 to-cyan-500 opacity-0 group-hover:opacity-100 transition-opacity duration-300"></span>
                                <span className="relative flex items-center">
                                    <Send className="w-5 h-5 mr-2" />
                                    Написать в Telegram
                                </span>
                            </a>
                            <span className="text-zinc-400 text-sm flex items-center px-4 py-2 bg-zinc-800/50 backdrop-blur border border-zinc-700/50 rounded-full">@wlad_rent</span>
                        </div>
                    </div>
                </div>

                {/* Features */}
                <div className="py-20 relative">
                    <div className="absolute inset-0 bg-zinc-800/30 backdrop-blur-sm border-y border-zinc-800/50"></div>
                    <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
                            <div className="bg-zinc-800/50 backdrop-blur-md rounded-2xl p-6 border border-zinc-700/50 hover:border-emerald-500/50 hover:bg-zinc-800 hover:-translate-y-1 transition-all duration-300 animate-fade-in-up delay-200 shadow-xl shadow-black/20">
                                <div className="w-12 h-12 bg-emerald-900/50 rounded-xl flex items-center justify-center mb-4 border border-emerald-500/30">
                                    <Zap className="w-6 h-6 text-emerald-400" />
                                </div>
                                <h3 className="text-lg font-bold text-white mb-2">Для долгой работы</h3>
                                <p className="text-zinc-400">Ёмкие аккумуляторы, которых хватает на полноценную смену. Меньше заряжаете — больше работаете и зарабатываете.</p>
                            </div>
                            <div className="bg-zinc-800/50 backdrop-blur-md rounded-2xl p-6 border border-zinc-700/50 hover:border-cyan-500/50 hover:bg-zinc-800 hover:-translate-y-1 transition-all duration-300 animate-fade-in-up delay-300 shadow-xl shadow-black/20">
                                <div className="w-12 h-12 bg-cyan-900/50 rounded-xl flex items-center justify-center mb-4 border border-cyan-500/30">
                                    <ShieldCheck className="w-6 h-6 text-cyan-400" />
                                </div>
                                <h3 className="text-lg font-bold text-white mb-2">Обслуживание включено</h3>
                                <p className="text-zinc-400">Ремонт и техническое обслуживание за наш счет. Мы следим за состоянием техники, чтобы вы работали без простоев.</p>
                            </div>
                            <div className="bg-zinc-800/50 backdrop-blur-md rounded-2xl p-6 border border-zinc-700/50 hover:border-purple-500/50 hover:bg-zinc-800 hover:-translate-y-1 transition-all duration-300 animate-fade-in-up delay-400 shadow-xl shadow-black/20">
                                <div className="w-12 h-12 bg-purple-900/50 rounded-xl flex items-center justify-center mb-4 border border-purple-500/30">
                                    <Navigation className="w-6 h-6 text-purple-400" />
                                </div>
                                <h3 className="text-lg font-bold text-white mb-2">Полная готовность</h3>
                                <p className="text-zinc-400">Каждый велосипед оборудован и готов к работе курьером. Выдаем и сразу можно выходить на линию.</p>
                            </div>
                        </div>
                    </div>
                </div>
            </main>

            <footer className="py-8 text-center text-zinc-400 text-sm relative z-10 animate-fade-in-up delay-400">
                <p>© {new Date().getFullYear()} E-Bike Rent Krakow. Аренда электровелосипедов.</p>
            </footer>
        </div>
    );
}
