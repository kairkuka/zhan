'use client';

import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useCallback, useEffect, useMemo, useState } from 'react';

import { OverviewCard } from '../../../components/OverviewCard';
import { TrendChart } from '../../../components/TrendChart';
import {
  getReadableErrorMessage,
  getStudentMasteryOverview,
  getStudentMasteryTrend,
  isAbortError,
  listMasterySnapshots,
} from '../../../lib/api';
import { useRequireAuth } from '../../../lib/useAuth';
import type { MasteryOverview, MasterySnapshotItem, TrendBucket } from '../../../types/api';

const TREND_LIMIT = 200;
const SNAPSHOT_LIMIT = 50;

function formatDate(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return date.toLocaleString();
}

export default function StudentAnalyticsPage() {
  const params = useParams<{ id: string }>();
  const studentId = useMemo(() => params.id ?? '', [params.id]);

  const { isAuthenticated, isChecking } = useRequireAuth();
  const [overview, setOverview] = useState<MasteryOverview | null>(null);
  const [trendBuckets, setTrendBuckets] = useState<TrendBucket[]>([]);
  const [trendNextCursor, setTrendNextCursor] = useState<string | null>(null);
  const [snapshots, setSnapshots] = useState<MasterySnapshotItem[]>([]);
  const [snapshotNextCursor, setSnapshotNextCursor] = useState<string | null>(null);
  const [isInitialLoading, setIsInitialLoading] = useState(true);
  const [isLoadingMoreTrend, setIsLoadingMoreTrend] = useState(false);
  const [isLoadingMoreSnapshots, setIsLoadingMoreSnapshots] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const loadInitialData = useCallback(
    async (signal?: AbortSignal) => {
      if (!studentId) {
        return;
      }

      setIsInitialLoading(true);
      setErrorMessage(null);

      try {
        const [overviewResult, trendResult, snapshotResult] = await Promise.all([
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
        ]);

        if (signal?.aborted) {
          return;
        }

        setOverview(overviewResult);
        setTrendBuckets(trendResult.buckets);
        setTrendNextCursor(trendResult.nextCursor ?? null);
        setSnapshots(snapshotResult.items);
        setSnapshotNextCursor(snapshotResult.nextCursor);
      } catch (error) {
        if (isAbortError(error) || signal?.aborted) {
          return;
        }

        setErrorMessage(getReadableErrorMessage(error, 'Failed to load student analytics.'));
      } finally {
        if (!signal?.aborted) {
          setIsInitialLoading(false);
        }
      }
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
    if (!studentId || !trendNextCursor || isLoadingMoreTrend) {
      return;
    }

    setIsLoadingMoreTrend(true);
    setErrorMessage(null);

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
      setErrorMessage(getReadableErrorMessage(error, 'Failed to load more trend data.'));
    } finally {
      setIsLoadingMoreTrend(false);
    }
  }, [isLoadingMoreTrend, studentId, trendNextCursor]);

  const handleLoadMoreSnapshots = useCallback(async () => {
    if (!studentId || !snapshotNextCursor || isLoadingMoreSnapshots) {
      return;
    }

    setIsLoadingMoreSnapshots(true);
    setErrorMessage(null);

    try {
      const snapshotResult = await listMasterySnapshots(studentId, {
        cursor: snapshotNextCursor,
        limit: SNAPSHOT_LIMIT,
      });

      setSnapshots((previous) => [...previous, ...snapshotResult.items]);
      setSnapshotNextCursor(snapshotResult.nextCursor);
    } catch (error) {
      setErrorMessage(getReadableErrorMessage(error, 'Failed to load more snapshots.'));
    } finally {
      setIsLoadingMoreSnapshots(false);
    }
  }, [isLoadingMoreSnapshots, snapshotNextCursor, studentId]);

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
          <Link className="buttonSecondary" href="/students">
            Back to students
          </Link>
        </div>

        <p className="muted">
          Student ID: <code>{studentId}</code>
        </p>

        {isInitialLoading && <p className="muted">Loading analytics...</p>}

        {!isInitialLoading && errorMessage && <p className="errorText">{errorMessage}</p>}

        {!isInitialLoading && !errorMessage && overview && (
          <div className="stack">
            <OverviewCard title="Mastery overview" overview={overview} />

            <TrendChart buckets={trendBuckets} title="Weekly mastery trend" />
            {trendNextCursor && (
              <div className="buttonRow">
                <button className="button" type="button" onClick={() => void handleLoadMoreTrend()}>
                  {isLoadingMoreTrend ? 'Loading...' : 'Load more trend'}
                </button>
              </div>
            )}

            <section className="card">
              <h2 className="cardTitle">Mastery snapshots</h2>
              {snapshots.length === 0 ? (
                <p className="muted">No snapshots available for this student yet.</p>
              ) : (
                <table className="table">
                  <thead>
                    <tr>
                      <th>Created</th>
                      <th>Average mastery</th>
                      <th>Skills tracked</th>
                      <th>Risk</th>
                    </tr>
                  </thead>
                  <tbody>
                    {snapshots.map((snapshot) => (
                      <tr key={snapshot.id}>
                        <td>{formatDate(snapshot.createdAt)}</td>
                        <td>{(snapshot.averageMastery * 100).toFixed(1)}%</td>
                        <td>{snapshot.skillsTracked}</td>
                        <td>{snapshot.riskLevel}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}

              {snapshotNextCursor && (
                <div className="buttonRow">
                  <button
                    className="button"
                    type="button"
                    onClick={() => void handleLoadMoreSnapshots()}
                  >
                    {isLoadingMoreSnapshots ? 'Loading...' : 'Load more snapshots'}
                  </button>
                </div>
              )}
            </section>
          </div>
        )}

        {!isInitialLoading && !errorMessage && !overview && (
          <section className="card">
            <h2 className="cardTitle">No analytics data</h2>
            <p className="muted">No overview is available for this student yet.</p>
          </section>
        )}
      </section>
    </main>
  );
}
