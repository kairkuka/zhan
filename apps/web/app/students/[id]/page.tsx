'use client';

import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useCallback, useEffect, useMemo, useState } from 'react';

import { OverviewCard, type OverviewMetric } from '../../../components/OverviewCard';
import { TrendChart } from '../../../components/TrendChart';
import {
  getReadableErrorMessage,
  getStudentMasteryOverview,
  getStudentMasteryTrend,
  getStudentProjection,
  isAbortError,
  listMasterySnapshots,
} from '../../../lib/api';
import { useRequireAuth } from '../../../lib/useAuth';
import type { MasteryOverview, MasterySnapshotItem, StudentProjection, TrendBucket } from '../../../types/api';

const TREND_LIMIT = 200;
const SNAPSHOT_LIMIT = 50;

function formatDate(value: string | null | undefined): string {
  if (!value) {
    return '—';
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return date.toLocaleString();
}

function formatMastery(value: number | undefined): string {
  if (typeof value !== 'number' || Number.isNaN(value)) {
    return '—';
  }

  return `${(value * 100).toFixed(1)}%`;
}

export default function StudentAnalyticsPage() {
  const params = useParams<{ id: string }>();
  const studentId = useMemo(() => params.id ?? '', [params.id]);

  const { isAuthenticated, isChecking } = useRequireAuth();

  const [overview, setOverview] = useState<MasteryOverview | null>(null);
  const [isOverviewLoading, setIsOverviewLoading] = useState(true);
  const [overviewError, setOverviewError] = useState<string | null>(null);

  const [trendBuckets, setTrendBuckets] = useState<TrendBucket[]>([]);
  const [trendNextCursor, setTrendNextCursor] = useState<string | null>(null);
  const [isTrendLoading, setIsTrendLoading] = useState(true);
  const [isTrendLoadingMore, setIsTrendLoadingMore] = useState(false);
  const [trendError, setTrendError] = useState<string | null>(null);

  const [snapshots, setSnapshots] = useState<MasterySnapshotItem[]>([]);
  const [snapshotNextCursor, setSnapshotNextCursor] = useState<string | null>(null);
  const [isSnapshotsLoading, setIsSnapshotsLoading] = useState(true);
  const [isSnapshotsLoadingMore, setIsSnapshotsLoadingMore] = useState(false);
  const [snapshotError, setSnapshotError] = useState<string | null>(null);

  const [projection, setProjection] = useState<StudentProjection | null>(null);
  const [isProjectionLoading, setIsProjectionLoading] = useState(true);
  const [projectionError, setProjectionError] = useState<string | null>(null);

  const loadInitialData = useCallback(
    async (signal?: AbortSignal) => {
      if (!studentId) {
        return;
      }

      setIsOverviewLoading(true);
      setIsTrendLoading(true);
      setIsSnapshotsLoading(true);
      setIsProjectionLoading(true);
      setOverviewError(null);
      setTrendError(null);
      setSnapshotError(null);
      setProjectionError(null);

      const results = await Promise.allSettled([
        getStudentMasteryOverview(studentId, { signal }),
        getStudentMasteryTrend(
          {
            studentId,
            bucket: 'week',
            limit: TREND_LIMIT,
          },
          { signal },
        ),
        listMasterySnapshots(studentId, {
          limit: SNAPSHOT_LIMIT,
          signal,
        }),
        getStudentProjection(studentId, { signal }),
      ]);

      if (signal?.aborted) {
        return;
      }

      const [overviewResult, trendResult, snapshotResult, projectionResult] = results;

      if (overviewResult.status === 'fulfilled') {
        setOverview(overviewResult.value);
      } else {
        setOverview(null);
        setOverviewError(getReadableErrorMessage(overviewResult.reason, 'Failed to load mastery overview.'));
      }
      setIsOverviewLoading(false);

      if (trendResult.status === 'fulfilled') {
        setTrendBuckets(trendResult.value.buckets);
        setTrendNextCursor(trendResult.value.nextCursor ?? null);
      } else {
        setTrendBuckets([]);
        setTrendNextCursor(null);
        setTrendError(getReadableErrorMessage(trendResult.reason, 'Failed to load mastery trend.'));
      }
      setIsTrendLoading(false);

      if (snapshotResult.status === 'fulfilled') {
        setSnapshots(snapshotResult.value.items);
        setSnapshotNextCursor(snapshotResult.value.nextCursor);
      } else {
        setSnapshots([]);
        setSnapshotNextCursor(null);
        setSnapshotError(
          getReadableErrorMessage(snapshotResult.reason, 'Failed to load mastery snapshots.'),
        );
      }
      setIsSnapshotsLoading(false);

      if (projectionResult.status === 'fulfilled') {
        setProjection(projectionResult.value);
      } else {
        setProjection(null);
        setProjectionError(
          getReadableErrorMessage(projectionResult.reason, 'Projection is temporarily unavailable.'),
        );
      }
      setIsProjectionLoading(false);
    },
    [studentId],
  );

  useEffect(() => {
    if (!isAuthenticated || !studentId) {
      return;
    }

    const controller = new AbortController();
    void loadInitialData(controller.signal);

    return () => {
      controller.abort();
    };
  }, [isAuthenticated, loadInitialData, studentId]);

  const handleLoadMoreTrend = useCallback(async () => {
    if (!studentId || !trendNextCursor || isTrendLoadingMore) {
      return;
    }

    setIsTrendLoadingMore(true);
    setTrendError(null);

    try {
      const trendResult = await getStudentMasteryTrend({
        studentId,
        bucket: 'week',
        cursor: trendNextCursor,
        limit: TREND_LIMIT,
      });

      setTrendBuckets((previous) => [...previous, ...trendResult.buckets]);
      setTrendNextCursor(trendResult.nextCursor ?? null);
    } catch (error) {
      if (!isAbortError(error)) {
        setTrendError(getReadableErrorMessage(error, 'Failed to load more trend data.'));
      }
    } finally {
      setIsTrendLoadingMore(false);
    }
  }, [isTrendLoadingMore, studentId, trendNextCursor]);

  const handleLoadMoreSnapshots = useCallback(async () => {
    if (!studentId || !snapshotNextCursor || isSnapshotsLoadingMore) {
      return;
    }

    setIsSnapshotsLoadingMore(true);
    setSnapshotError(null);

    try {
      const snapshotResult = await listMasterySnapshots(studentId, {
        cursor: snapshotNextCursor,
        limit: SNAPSHOT_LIMIT,
      });

      setSnapshots((previous) => [...previous, ...snapshotResult.items]);
      setSnapshotNextCursor(snapshotResult.nextCursor);
    } catch (error) {
      if (!isAbortError(error)) {
        setSnapshotError(getReadableErrorMessage(error, 'Failed to load more snapshots.'));
      }
    } finally {
      setIsSnapshotsLoadingMore(false);
    }
  }, [isSnapshotsLoadingMore, snapshotNextCursor, studentId]);

  const overviewMetrics = useMemo<OverviewMetric[]>(
    () => [
      {
        label: 'Average mastery',
        value: formatMastery(overview?.averageMastery),
      },
      {
        label: 'Skills tracked',
        value: overview?.skillsTracked ?? '—',
      },
      {
        label: 'Risk level',
        value: overview?.riskLevel ?? 'N/A',
      },
    ],
    [overview],
  );

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
          <h1>Student analytics</h1>
          <div className="buttonRow">
            <Link className="buttonSecondary" href="/students">
              Back to students
            </Link>
            <button className="buttonSecondary" type="button" onClick={() => void loadInitialData()}>
              Refresh
            </button>
          </div>
        </div>

        <p className="muted">
          Student ID: <code>{studentId}</code>
        </p>

        <OverviewCard title="Mastery overview" metrics={overviewMetrics} />
        {isOverviewLoading && <p className="muted">Loading mastery overview...</p>}
        {!isOverviewLoading && overviewError && <p className="errorText">{overviewError}</p>}

        {isTrendLoading ? (
          <section className="card">
            <h2 className="cardTitle">Mastery trend</h2>
            <p className="muted">Loading mastery trend...</p>
          </section>
        ) : trendError ? (
          <section className="card">
            <h2 className="cardTitle">Mastery trend</h2>
            <p className="errorText">{trendError}</p>
          </section>
        ) : (
          <TrendChart buckets={trendBuckets} title="Weekly mastery trend" />
        )}

        {!isTrendLoading && !trendError && trendNextCursor && (
          <div className="buttonRow">
            <button className="button" type="button" onClick={() => void handleLoadMoreTrend()}>
              {isTrendLoadingMore ? 'Loading...' : 'Load more trend'}
            </button>
          </div>
        )}

        <section className="card">
          <h2 className="cardTitle">Snapshots timeline</h2>

          {isSnapshotsLoading && <p className="muted">Loading snapshots...</p>}
          {!isSnapshotsLoading && snapshotError && <p className="errorText">{snapshotError}</p>}

          {!isSnapshotsLoading && !snapshotError && snapshots.length === 0 && (
            <p className="muted">No snapshots available for this student yet.</p>
          )}

          {!isSnapshotsLoading && !snapshotError && snapshots.length > 0 && (
            <ul className="listMuted">
              {snapshots.map((snapshot) => (
                <li key={snapshot.id}>
                  {formatDate(snapshot.createdAt)} - mastery {formatMastery(snapshot.averageMastery)} - risk{' '}
                  {snapshot.riskLevel}
                </li>
              ))}
            </ul>
          )}

          {!isSnapshotsLoading && !snapshotError && snapshotNextCursor && (
            <div className="buttonRow">
              <button
                className="button"
                type="button"
                onClick={() => void handleLoadMoreSnapshots()}
              >
                {isSnapshotsLoadingMore ? 'Loading...' : 'Load more snapshots'}
              </button>
            </div>
          )}
        </section>

        <section className="card">
          <h2 className="cardTitle">Projection summary</h2>

          {isProjectionLoading && <p className="muted">Loading projection summary...</p>}

          {!isProjectionLoading && projection && (
            <dl className="statsGrid">
              <div className="statItem">
                <dt>Skills tracked</dt>
                <dd>{projection.skillsTracked}</dd>
              </div>
              <div className="statItem">
                <dt>Average mastery</dt>
                <dd>{formatMastery(projection.averageMastery)}</dd>
              </div>
              <div className="statItem">
                <dt>Risk level</dt>
                <dd>{projection.riskLevel}</dd>
              </div>
              <div className="statItem">
                <dt>High risk skills</dt>
                <dd>{projection.highRiskSkills}</dd>
              </div>
              <div className="statItem">
                <dt>Medium risk skills</dt>
                <dd>{projection.mediumRiskSkills}</dd>
              </div>
              <div className="statItem">
                <dt>Low risk skills</dt>
                <dd>{projection.lowRiskSkills}</dd>
              </div>
            </dl>
          )}

          {!isProjectionLoading && !projection && (
            <p className="muted">
              Projection is unavailable right now.
              {projectionError ? ` ${projectionError}` : ''}
            </p>
          )}
        </section>
      </section>
    </main>
  );
}
