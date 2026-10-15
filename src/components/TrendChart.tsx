import { useEffect, useState } from 'react';

export type TrendPoint = { label: string; value: number; detail?: string };
export type TrendSeries = { key: string; label: string; data: TrendPoint[]; color: string; forecastLast?: boolean };

type Props = { data?: TrendPoint[]; series?: TrendSeries[]; accent?: string; valueFormatter?: (value: number) => string; ariaLabel: string };
const WIDTH = 1000;
const HEIGHT = 260;
const PADDING = { top: 12, right: 12, bottom: 30, left: 12 };
function drawPath(points: Array<{ x: number; y: number }>) {
  if (points.length < 2) return '';
  let result = `M ${points[0].x} ${points[0].y}`;
  for (let index = 0; index < points.length - 1; index += 1) {
    const current = points[index];
    const next = points[index + 1];
    const previous = points[index - 1] || current;
    const afterNext = points[index + 2] || next;
    result += ` C ${current.x + (next.x - previous.x) / 6} ${current.y + (next.y - previous.y) / 6}, ${next.x - (afterNext.x - current.x) / 6} ${next.y - (afterNext.y - current.y) / 6}, ${next.x} ${next.y}`;
  }
  return result;
}

export default function TrendChart({ data = [], series, accent = '#64748b', valueFormatter = String, ariaLabel }: Props) {
  const chartSeries = series?.length ? series : [{ key: 'default', label: ariaLabel, data, color: accent }];
  const labels = chartSeries[0]?.data || [];
  const chartWidth = WIDTH - PADDING.left - PADDING.right;
  const chartHeight = HEIGHT - PADDING.top - PADDING.bottom;
  const maximum = Math.max(1, ...chartSeries.flatMap(item => item.data.map(point => point.value)));
  const baseline = PADDING.top + chartHeight;
  const toPoints = (items: TrendPoint[]) => items.map((point, index) => ({ ...point, x: PADDING.left + (items.length === 1 ? chartWidth / 2 : (index / (items.length - 1)) * chartWidth), y: baseline - (point.value / maximum) * chartHeight }));
  const labelStep = Math.max(1, Math.ceil(labels.length / 6));
  const animationKey = chartSeries.map(item => `${item.key}:${item.data.map(point => point.value).join(',')}`).join('|');
  const [progress, setProgress] = useState(0);

  useEffect(() => {
    let frame = 0;
    const startedAt = performance.now();
    const tick = (now: number) => {
      const value = Math.min((now - startedAt) / 900, 1);
      setProgress(1 - Math.pow(1 - value, 3));
      if (value < 1) frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [animationKey]);

  return <svg className="h-full w-full overflow-visible" viewBox={`0 0 ${WIDTH} ${HEIGHT}`} role="img" aria-label={ariaLabel} preserveAspectRatio="none">
    <defs><linearGradient id="trend-area-gradient" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="var(--or-primary)" stopOpacity="0.2" /><stop offset="100%" stopColor="var(--or-primary)" stopOpacity="0" /></linearGradient></defs>
    {[0, 1, 2].map(step => <line key={step} x1={PADDING.left} x2={WIDTH - PADDING.right} y1={PADDING.top + (chartHeight / 2) * step} stroke="currentColor" strokeDasharray="3 5" className="text-slate-200 dark:text-slate-800" />)}
    {chartSeries.map(item => {
      const points = toPoints(item.data).map(point => ({ ...point, y: baseline + (point.y - baseline) * progress }));
      const solid = item.forecastLast && points.length > 1 ? points.slice(0, -1) : points;
      const forecast = item.forecastLast && points.length > 1 ? points.slice(-2) : [];
      const area = item.key === 'payments' && solid.length > 1 ? `${drawPath(solid)} L ${solid[solid.length - 1].x} ${baseline} L ${solid[0].x} ${baseline} Z` : '';
      return <g key={item.key}>
        {area && <path d={area} fill="url(#trend-area-gradient)" />}
        {solid.length > 1 && <path d={drawPath(solid)} fill="none" stroke={item.color} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />}
        {forecast.length === 2 && <path d={drawPath(forecast)} fill="none" stroke={item.color} strokeWidth="2.5" strokeDasharray="6 6" strokeLinecap="round" vectorEffect="non-scaling-stroke" opacity="0.75"><title>Текущая неделя: прогноз</title></path>}
        {points.map((point, index) => <circle key={index} cx={point.x} cy={point.y} r="3.5" fill={item.color} fillOpacity={item.forecastLast && index === points.length - 1 ? 0.55 : 1} stroke="var(--or-cloud)" strokeWidth="2" vectorEffect="non-scaling-stroke"><title>{point.detail || `${item.label}: ${valueFormatter(point.value)}`}</title></circle>)}
      </g>;
    })}
    {labels.map((point, index) => (index % labelStep === 0 || index === labels.length - 1) && <text key={index} x={PADDING.left + (labels.length === 1 ? chartWidth / 2 : (index / (labels.length - 1)) * chartWidth)} y={HEIGHT - 7} fill="currentColor" fontSize="13" fontWeight="700" textAnchor="middle" className="text-slate-500 dark:text-slate-300">{point.label}</text>)}
  </svg>;
}
