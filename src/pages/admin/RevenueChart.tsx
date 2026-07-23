import TrendChart from '../../components/TrendChart';

type ChartPoint = {
    date: string;
    label: string;
    fullLabel: string;
    amount: number;
};

type Props = { data: ChartPoint[] };

export default function RevenueChart({ data }: Props) {
    return (
        <TrendChart
            data={data.map((point) => ({ label: point.label, value: point.amount, detail: `${point.fullLabel}: ${point.amount.toLocaleString('ru-RU')} zł` }))}
            valueFormatter={(value) => `${value.toLocaleString('ru-RU')} zł`}
            ariaLabel="График дохода"
        />
    );
}
