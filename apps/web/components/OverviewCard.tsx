import type { MasteryOverview } from '../types/api';

export type OverviewMetric = {
  label: string;
  value: string | number;
};

type OverviewCardProps = {
  title?: string;
  subtitle?: string;
} &
  (
    | {
        overview: MasteryOverview;
        metrics?: never;
      }
    | {
        metrics: OverviewMetric[];
        overview?: never;
      }
  );

function hasMetrics(
  props: OverviewCardProps,
): props is { title?: string; subtitle?: string; metrics: OverviewMetric[]; overview?: never } {
  return Array.isArray((props as { metrics?: OverviewMetric[] }).metrics);
}

function formatMastery(value: number): string {
  return `${(value * 100).toFixed(1)}%`;
}

function metricsFromOverview(overview: MasteryOverview): OverviewMetric[] {
  return [
    {
      label: 'Average mastery',
      value: formatMastery(overview.averageMastery),
    },
    {
      label: 'Skills tracked',
      value: overview.skillsTracked,
    },
    {
      label: 'Risk level',
      value: overview.riskLevel ?? 'N/A',
    },
  ];
}

export function OverviewCard(props: OverviewCardProps) {
  const title = props.title ?? 'Overview';
  const subtitle = props.subtitle;
  const metrics = hasMetrics(props) ? props.metrics : metricsFromOverview(props.overview);

  return (
    <section className="card">
      <h2 className="cardTitle">{title}</h2>
      {subtitle && <p className="muted">{subtitle}</p>}
      <dl className="statsGrid">
        {metrics.map((metric) => (
          <div key={metric.label} className="statItem">
            <dt>{metric.label}</dt>
            <dd>{String(metric.value)}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}
