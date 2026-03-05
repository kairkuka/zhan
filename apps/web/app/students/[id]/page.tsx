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
} from '../../../lib/api';
import { useRequireAuth } from '../../../lib/useAuth';
import type { MasteryOverview, TrendBucket } from '../../../types/api';

export default function StudentAnalyticsPage() {
  const params = useParams<{ id: string }>();
  const studentId = useMemo(() => params.id ?? '', [params.id]);

  const { isAuthenticated, isChecking } = useRequireAuth();
  const [overview, setOverview] = useState<MasteryOverview | null>(null);
  const [trendBuckets, setTrendBuckets] = useState<TrendBucket[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [isInitialLoading, setIsInitialLoading] = useState(true);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const loadInitialData = useCallback(async (signal?: AbortSignal) => {
    if (!studentId) {
      return;
    }

    setIsInitialLoading(true);
    setErrorMessage(null);

    try {
      const [overviewResult, trendResult] = await Promise.all([
        getStudentMasteryOverview(studentId, { signal }),
        getStudentMasteryTrend(
          {
            studentId,
            bucket: 'week',
            limit: 200,
          },
          { signal },
        ),
      ]);

      if (signal?.aborted) {
        return;
      }

      setOverview(overviewResult);
      setTrendBuckets(trendResult.buckets);
      setNextCursor(trendResult.nextCursor ?? null);
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
  }, [studentId]);

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

  const handleLoadMore = useCallback(async () => {
    if (!studentId || !nextCursor || isLoadingMore) {
      return;
    }

    setIsLoadingMore(true);
    setErrorMessage(null);

    try {
      const trendResult = await getStudentMasteryTrend({
        studentId,
        bucket: 'week',
        cursor: nextCursor,
        limit: 200,
      });

      setTrendBuckets((previous) => [...previous, ...trendResult.buckets]);
      setNextCursor(trendResult.nextCursor ?? null);
    } catch (error) {
      setErrorMessage(getReadableErrorMessage(error, 'Failed to load more trend data.'));
    } finally {
      setIsLoadingMore(false);
    }
  }, [isLoadingMore, nextCursor, studentId]);

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
            {nextCursor && (
              <div className="buttonRow">
                <button className="button" type="button" onClick={() => void handleLoadMore()}>
                  {isLoadingMore ? 'Loading...' : 'Load more'}
                </button>
              </div>
            )}
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
