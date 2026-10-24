import { Languages } from 'lucide-react';
import { useI18n } from './index';

export function LanguageToggle({ className = '' }: { className?: string }) {
  const { language, toggleLanguage, t } = useI18n();
  const nextLanguage = language === 'ru' ? 'Английский' : 'Русский';
  return (
    <div className={`flex justify-center ${className}`}>
      <button
        type="button"
        onClick={toggleLanguage}
        className="inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-[10px] font-semibold tracking-wide text-slate-500 transition-colors hover:bg-slate-200/60 hover:text-slate-800 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-white"
        title={`${t('Язык')}: ${t(nextLanguage)}`}
        aria-label={`${t('Язык')}: ${t(nextLanguage)}`}
      >
        <Languages className="h-3.5 w-3.5" aria-hidden="true" />
        {language === 'ru' ? 'English' : 'Русский'}
      </button>
    </div>
  );
}
