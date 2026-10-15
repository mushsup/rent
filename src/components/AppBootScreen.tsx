export default function AppBootScreen() {
  return <div className="flex min-h-screen items-center justify-center bg-slate-950 px-6 text-center text-white">
    <div>
      <div className="flex items-center justify-center gap-2" aria-label="Загрузка приложения" role="status">
        {[0, 1, 2].map((dot) => <span key={dot} className="h-3 w-3 animate-bounce rounded-full bg-lime-300 motion-reduce:animate-none" style={{ animationDelay: `${dot * 140}ms` }} />)}
      </div>
      <p className="mt-4 text-sm font-medium text-slate-300">Загружаем последние данные</p>
    </div>
  </div>;
}
