import { useId } from 'react';

export type TrendPoint = {
    label: string;
    value: number;
    detail?: string;
};

type Props = {
    data: TrendPoint[];
    accent?: string;
    valueFormatter?: (value: number) => string;
    ariaLabel: string;
};

const WIDTH = 1000;
const HEIGHT = 260;
const PADDING = { top: 12, right: 12, bottom: 30, left: 12 };

export default function TrendChart({ data, accent = 'var(--or-primary)', valueFormatter = (value) => String(value), ariaLabel }: Props) {
    const gradientId = `trend-gradient-${useId().replace(/:/g, '')}`;
    const chartWidth = WIDTH - PADDING.left - PADDING.right;
    const chartHeight = HEIGHT - PADDING.top - PADDING.bottom;
    const values = data.map((point) => point.value);
    const min = Math.min(...values, 0);
    const max = Math.max(...values, 1);
    const range = max - min || 1;
    const points = data.map((point, index) => ({
        ...point,
        x: PADDING.left + (data.length === 1 ? chartWidth / 2 : (index / (data.length - 1)) * chartWidth),
        y: PADDING.top + chartHeight - ((point.value - min) / range) * chartHeight,
    }));
    const linePath = points.map((point, index) => `${index === 0 ? 'M' : 'L'} ${point.x} ${point.y}`).join(' ');
    const areaPath = points.length > 0
        ? `${linePath} L ${points[points.length - 1].x} ${PADDING.top + chartHeight} L ${points[0].x} ${PADDING.top + chartHeight} Z`
        : '';
    const labelStep = Math.max(1, Math.ceil(data.length / 6));

    if (data.length === 0) return null;

    return (
        <svg className="h-full w-full overflow-visible" viewBox={`0 0 ${WIDTH} ${HEIGHT}`} role="img" aria-label={ariaLabel} preserveAspectRatio="none">
            <defs>
                <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor={accent} stopOpacity={0.22} />
                    <stop offset="95%" stopColor={accent} stopOpacity={0} />
                </linearGradient>
            </defs>

            {[0, 1, 2].map((step) => {
                const y = PADDING.top + (chartHeight / 2) * step;
                return <line key={step} x1={PADDING.left} x2={WIDTH - PADDING.right} y1={y} y2={y} stroke="currentColor" strokeDasharray="3 5" className="text-slate-200 dark:text-slate-800" />;
            })}

            <path d={areaPath} fill={`url(#${gradientId})`} />
            <path d={linePath} fill="none" stroke={accent} strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />

            {points.map((point, index) => (
                <g key={`${point.label}-${index}`}>
                    <circle cx={point.x} cy={point.y} r="4" fill={accent} stroke="var(--or-cloud)" strokeWidth="2" vectorEffect="non-scaling-stroke">
                        <title>{point.detail || `${point.label}: ${valueFormatter(point.value)}`}</title>
                    </circle>
                    {(index % labelStep === 0 || index === points.length - 1) && (
                        <text x={point.x} y={HEIGHT - 7} fill="currentColor" fontSize="11" textAnchor="middle" className="text-slate-500 dark:text-slate-400">
                            {point.label}
                        </text>
                    )}
                </g>
            ))}
        </svg>
    );
}
