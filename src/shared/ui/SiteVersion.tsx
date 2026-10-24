import { useI18n } from '../../i18n';

const BUILD_TIME = new Date(__BUILD_TIME__);

export function SiteVersion() {
    const { language, t } = useI18n();
    const formattedBuildTime = new Intl.DateTimeFormat(language === 'en' ? 'en-GB' : 'ru-RU', {
        dateStyle: 'short',
        timeStyle: 'short',
    }).format(BUILD_TIME);
    return <p className="text-center text-[10px] font-medium tracking-wide text-slate-500">{t('Версия сайта · {{date}}', { date: formattedBuildTime })}</p>;
}
