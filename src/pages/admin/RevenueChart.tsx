import TrendChart, { type TrendSeries } from '../../components/TrendChart';
import { useI18n } from '../../i18n';

type ChartPoint = {
    date: string;
    label: string;
    fullLabel: string;
    amount: number;
};

type Props = { series: Array<{ key: string; label: string; data: ChartPoint[]; color: string; forecastLast?: boolean }> };

export default function RevenueChart({ series }: Props) {
    const { language, t } = useI18n();
    const locale = language === 'ru' ? 'ru-RU' : 'en-US';
    return (
        <TrendChart
            series={series.map((item): TrendSeries => ({ ...item, data: item.data.map((point) => ({ label: point.label, value: point.amount, detail: `${point.fullLabel}: ${point.amount.toLocaleString(locale)} zł` })) }))}
            valueFormatter={(value) => `${value.toLocaleString(locale)} zł`}
            ariaLabel={t('График дохода')}
        />
    );
}
