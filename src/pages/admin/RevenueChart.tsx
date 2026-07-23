import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';

type ChartPoint = {
    date: string;
    label: string;
    fullLabel: string;
    amount: number;
};

type Props = { data: ChartPoint[] };

function CustomXAxisTick({ x, y, payload, data }: any) {
    const item = data.find((point: ChartPoint) => point.date === payload.value);
    return (
        <text x={x} y={y + 5} fill="#a1a1aa" fontSize={11} textAnchor="middle">
            {item ? item.label : payload.value}
        </text>
    );
}

export default function RevenueChart({ data }: Props) {
    return (
        <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={data} margin={{ top: 0, right: 0, left: 0, bottom: 10 }}>
                <defs>
                    <linearGradient id="colorAmount" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#bef264" stopOpacity={0.28} />
                        <stop offset="95%" stopColor="#bef264" stopOpacity={0} />
                    </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#3f3f46" vertical={false} />
                <XAxis
                    dataKey="date"
                    stroke="#a1a1aa"
                    fontSize={11}
                    tickLine={false}
                    axisLine={false}
                    tickMargin={5}
                    tick={(props) => <CustomXAxisTick {...props} data={data} />}
                />
                <YAxis hide />
                <Tooltip
                    contentStyle={{ backgroundColor: '#18181b', borderColor: '#3f3f46', borderRadius: '0.625rem', color: '#f4f4f5', boxShadow: '0 8px 24px rgba(0, 0, 0, 0.18)' }}
                    itemStyle={{ color: '#bef264' }}
                    formatter={(value) => [`${Number(value).toLocaleString('ru-RU')} zł`, 'Доход']}
                    labelFormatter={(label) => data.find((point) => point.date === label)?.fullLabel || label}
                />
                <Area type="monotone" dataKey="amount" stroke="#bef264" strokeWidth={2} fillOpacity={1} fill="url(#colorAmount)" activeDot={{ className: 'focus:outline-none', style: { outline: 'none' } }} />
            </AreaChart>
        </ResponsiveContainer>
    );
}
