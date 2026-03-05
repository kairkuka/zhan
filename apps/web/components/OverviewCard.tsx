import type { MasteryOverview } from '../types/api';

type OverviewCardProps = {
  overview: MasteryOverview;
};

function formatMastery(value: number): string {
  return `${(value * 100).toFixed(1)}%`;
}

export function OverviewCard({ overview }: OverviewCardProps) {
  return (
    <section className="card">
      <h2 className="cardTitle">Mastery overview</h2>
      <dl className="statsGrid">
        <div className="statItem">
          <dt>Average mastery</dt>
          <dd>{formatMastery(overview.averageMastery)}</dd>
        </div>
        <div className="statItem">
          <dt>Skills tracked</dt>
          <dd>{overview.skillsTracked}</dd>
        </div>
        <div className="statItem">
          <dt>Risk level</dt>
          <dd>{overview.riskLevel ?? 'N/A'}</dd>
        </div>
      </dl>
    </section>
  );
}
