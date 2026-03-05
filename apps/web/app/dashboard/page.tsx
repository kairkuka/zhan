'use client';

import { useMemo } from 'react';

import { OverviewCard, type OverviewMetric } from '../../components/OverviewCard';
import { TrendChart } from '../../components/TrendChart';
import { useRequireAuth } from '../../lib/useAuth';
import { useDashboardData } from '../../lib/useDashboardData';

function formatMastery(value: number): string {
  return `${(value * 100).toFixed(1)}%`;
}

function LoadingSkeleton() {
  return (
    <div className="stack" aria-hidden="true">
      <div className="kpiGrid">
        <section className="card skeletonCard" />
        <section className="card skeletonCard" />
        <section className="card skeletonCard" />
      </div>
      <section className="card skeletonCard chartSkeleton" />
    </div>
  );
}

export default function DashboardPage() {
  const { isAuthenticated, isChecking } = useRequireAuth();
  const { state, reload } = useDashboardData({
    sampleSize: 10,
    enabled: isAuthenticated,
  });

  const kpiCards = useMemo(() => {
    if (state.status !== 'ready') {
      return [] as Array<{ title: string; metrics: OverviewMetric[]; subtitle?: string }>;
    }

    return [
      {
        title: 'Students',
        subtitle: 'Total and sampled for KPI calculations',
        metrics: [
          { label: 'Total students', value: state.data.totalStudents },
          { label: 'Sample size', value: state.data.sampledStudents },
          { label: 'At risk', value: state.data.studentsAtRisk },
        ],
      },
      {
        title: 'Mastery KPI',
        subtitle: `Average from sampled students (${state.data.kpiSource})`,
        metrics: [
          { label: 'Average mastery', value: formatMastery(state.data.averageMastery) },
          { label: 'KPI source', value: state.data.kpiSource },
        ],
      },
      {
        title: 'Trend source',
        subtitle: 'Current chart is based on one representative student',
        metrics: [{ label: 'Student ID', value: state.data.trendStudentId }],
      },
    ];
  }, [state]);

  if (isChecking || !isAuthenticated) {
    return (
      <main className="page">
        <section className="panel">
          <p className="muted">Checking session...</p>
        </section>
      </main>
    );
  }

  return (
    <main className="page">
      <section className="panel">
        <div className="headerRow">
          <h1>Dashboard</h1>
          <button className="buttonSecondary" type="button" onClick={reload}>
            Refresh
          </button>
        </div>

        <p className="muted">Front parity MVP summary from live backend data.</p>

        {state.status === 'loading' && <LoadingSkeleton />}

        {state.status === 'empty' && (
          <section className="card">
            <h2 className="cardTitle">No dashboard data yet</h2>
            <p className="muted">{state.message}</p>
          </section>
        )}

        {state.status === 'error' && (
          <section className="card">
            <h2 className="cardTitle">Failed to load dashboard</h2>
            <p className="errorText">{state.message}</p>
          </section>
        )}

        {state.status === 'ready' && (
          <div className="stack">
            {state.data.kpiSource === 'overview' && (
              <p className="muted">
                Projection endpoints partially unavailable. KPIs fall back to mastery overview.
              </p>
            )}

            <div className="kpiGrid">
              {kpiCards.map((card) => (
                <OverviewCard
                  key={card.title}
                  title={card.title}
                  subtitle={card.subtitle}
                  metrics={card.metrics}
                />
              ))}
            </div>

            {state.data.projectionSummary && (
              <section className="card">
                <h2 className="cardTitle">Risk breakdown</h2>
                <p className="muted">
                  Projection from student <code>{state.data.projectionSummary.studentId}</code>
                </p>
                <ul className="listMuted">
                  <li>High risk skills: {state.data.projectionSummary.highRiskSkills}</li>
                  <li>Medium risk skills: {state.data.projectionSummary.mediumRiskSkills}</li>
                  <li>Low risk skills: {state.data.projectionSummary.lowRiskSkills}</li>
                  <li>Projection risk level: {state.data.projectionSummary.riskLevel}</li>
                </ul>
              </section>
            )}

            <TrendChart buckets={state.data.trendBuckets} title="Weekly mastery trend" />
          </div>
        )}
      </section>
    </main>
  );
}
