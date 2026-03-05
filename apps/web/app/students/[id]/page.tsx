'use client';

import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { useEffect, useMemo, useState } from 'react';

import { OverviewCard } from '../../../components/OverviewCard';
import { TrendChart } from '../../../components/TrendChart';
import {
  getReadableErrorMessage,
  getStudentMasteryOverview,
  getStudentMasteryTrend,
  getToken,
} from '../../../lib/api';
import type { MasteryOverview, TrendBucket } from '../../../types/api';

export default function StudentAnalyticsPage() {
  const router = useRouter();
  const params = useParams<{ id: string }>();
  const studentId = useMemo(() => params.id ?? '', [params.id]);

  const [overview, setOverview] = useState<MasteryOverview | null>(null);
  const [trendBuckets, setTrendBuckets] = useState<TrendBucket[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [isInitialLoading, setIsInitialLoading] = useState(true);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    if (!studentId) {
      return;
    }

    if (!getToken()) {
      router.replace('/login');
      return;
    }

    void loadInitialData(studentId);
  }, [router, studentId]);

  async function loadInitialData(currentStudentId: string) {
    setIsInitialLoading(true);
    setErrorMessage(null);

    try {
      const [overviewResult, trendResult] = await Promise.all([
        getStudentMasteryOverview(currentStudentId),
        getStudentMasteryTrend({
          studentId: currentStudentId,
          bucket: 'week',
          limit: 200,
        }),
      ]);

      setOverview(overviewResult);
      setTrendBuckets(trendResult.buckets);
      setNextCursor(trendResult.nextCursor ?? null);
    } catch (error) {
      setErrorMessage(getReadableErrorMessage(error, 'Failed to load student analytics.'));
    } finally {
      setIsInitialLoading(false);
    }
  }

  async function handleLoadMore() {
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
            <OverviewCard overview={overview} />
            <TrendChart buckets={trendBuckets} />
            {nextCursor && (
              <div className="buttonRow">
                <button className="button" type="button" onClick={() => void handleLoadMore()}>
                  {isLoadingMore ? 'Loading...' : 'Load more'}
                </button>
              </div>
            )}
          </div>
        )}
      </section>
    </main>
  );
}
