'use client';

import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';

import type { TrendBucket } from '../types/api';

type TrendChartProps = {
  buckets: TrendBucket[];
};

function formatPercent(value: number): string {
  return `${(value * 100).toFixed(1)}%`;
}

function normalizeToNumber(value: unknown): number {
  if (typeof value === 'number') {
    return value;
  }

  if (typeof value === 'string') {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
  }

  return 0;
}

export function TrendChart({ buckets }: TrendChartProps) {
  if (buckets.length === 0) {
    return (
      <section className="card">
        <h2 className="cardTitle">Mastery trend</h2>
        <p className="muted">No trend data available for this range.</p>
      </section>
    );
  }

  return (
    <section className="card">
      <h2 className="cardTitle">Mastery trend</h2>
      <div className="chartContainer">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={buckets} margin={{ top: 8, right: 12, bottom: 8, left: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#d1d5db" />
            <XAxis dataKey="date" stroke="#374151" />
            <YAxis
              stroke="#374151"
              domain={[0, 1]}
              tickFormatter={(value: number) => formatPercent(value)}
            />
            <Tooltip
              formatter={(value) => formatPercent(normalizeToNumber(value))}
              labelFormatter={(label) => `Date: ${String(label)}`}
            />
            <Line
              type="monotone"
              dataKey="averageMastery"
              stroke="#2563eb"
              strokeWidth={2}
              dot={{ r: 3 }}
              isAnimationActive={false}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </section>
  );
}
