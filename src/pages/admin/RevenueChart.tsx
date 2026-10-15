import TrendChart, { type TrendSeries } from '../../components/TrendChart';

type ChartPoint = {
    date: string;
    label: string;
    fullLabel: string;
    amount: number;
};

type Props = { series: Array<{ key: string; label: string; data: ChartPoint[]; color: string; forecastLast?: boolean }> };

export default function RevenueChart({ series }: Props) {
    return (
        <TrendChart
            series={series.map((item): TrendSeries => ({ ...item, data: item.data.map((point) => ({ label: point.label, value: point.amount, detail: `${point.fullLabel}: ${point.amount.toLocaleString('ru-RU')} zł` })) }))}
            valueFormatter={(value) => `${value.toLocaleString('ru-RU')} zł`}
            ariaLabel="График дохода"
        />
    );
}
