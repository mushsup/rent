const BUILD_TIME = new Date(__BUILD_TIME__);

const formattedBuildTime = new Intl.DateTimeFormat('ru-RU', {
    dateStyle: 'short',
    timeStyle: 'short',
}).format(BUILD_TIME);

export function SiteVersion() {
    return <p className="text-center text-[10px] font-medium tracking-wide text-slate-500">Версия сайта · {formattedBuildTime}</p>;
}
