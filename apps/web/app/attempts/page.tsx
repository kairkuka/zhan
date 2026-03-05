'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';

import { getReadableErrorMessage, isAbortError, listAttempts } from '../../lib/api';
import { useRequireAuth } from '../../lib/useAuth';
import type { AttemptListItem } from '../../types/api';

type PageStatus = 'loading' | 'ready' | 'error';

const PAGE_LIMIT = 50;

function formatDate(value: string | null): string {
  if (!value) {
    return '—';
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return date.toLocaleString();
}

export default function AttemptsPage() {
  const { isAuthenticated, isChecking } = useRequireAuth();

  const [attempts, setAttempts] = useState<AttemptListItem[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [status, setStatus] = useState<PageStatus>('loading');
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const loadInitial = useCallback(async (signal?: AbortSignal) => {
    setStatus('loading');
    setErrorMessage(null);

    try {
      const response = await listAttempts({
        limit: PAGE_LIMIT,
        signal,
      });

      if (signal?.aborted) {
        return;
      }

      setAttempts(response.items);
      setNextCursor(response.nextCursor);
      setStatus('ready');
    } catch (error) {
      if (isAbortError(error) || signal?.aborted) {
        return;
      }

      setStatus('error');
      setErrorMessage(getReadableErrorMessage(error, 'Failed to load attempts.'));
    }
  }, []);

  useEffect(() => {
    if (!isAuthenticated) {
      return;
    }

    const controller = new AbortController();
    void loadInitial(controller.signal);

    return () => {
      controller.abort();
    };
  }, [isAuthenticated, loadInitial]);

  const loadMore = useCallback(async () => {
    if (!nextCursor || isLoadingMore) {
      return;
    }

    setIsLoadingMore(true);
    setErrorMessage(null);

    try {
      const response = await listAttempts({
        cursor: nextCursor,
        limit: PAGE_LIMIT,
      });

      setAttempts((previous) => [...previous, ...response.items]);
      setNextCursor(response.nextCursor);
    } catch (error) {
      setErrorMessage(getReadableErrorMessage(error, 'Failed to load more attempts.'));
    } finally {
      setIsLoadingMore(false);
    }
  }, [isLoadingMore, nextCursor]);

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
          <h1>Attempts</h1>
          <button
            className="buttonSecondary"
            type="button"
            onClick={() => void loadInitial()}
            disabled={status === 'loading'}
          >
            Retry
          </button>
        </div>

        <p className="muted">Recent attempts in your organization.</p>

        {status === 'loading' && <p className="muted">Loading attempts...</p>}

        {status === 'error' && (
          <section className="card">
            <h2 className="cardTitle">Unable to load attempts</h2>
            <p className="errorText">{errorMessage}</p>
          </section>
        )}

        {status === 'ready' && (
          <>
            {attempts.length === 0 ? (
              <section className="card">
                <h2 className="cardTitle">No attempts yet</h2>
                <p className="muted">Attempts will appear after students submit assignments.</p>
              </section>
            ) : (
              <table className="table">
                <thead>
                  <tr>
                    <th>Attempt</th>
                    <th>Assignment</th>
                    <th>Student</th>
                    <th>Status</th>
                    <th>Total score</th>
                    <th>Submitted</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {attempts.map((attempt) => (
                    <tr key={attempt.attemptId}>
                      <td>
                        <code>{attempt.attemptId}</code>
                      </td>
                      <td>
                        <code>{attempt.assignmentId}</code>
                      </td>
                      <td>
                        <code>{attempt.studentId}</code>
                      </td>
                      <td>{attempt.status}</td>
                      <td>{attempt.totalScore}</td>
                      <td>{formatDate(attempt.submittedAt)}</td>
                      <td>
                        <Link className="buttonLink" href={`/attempts/${attempt.attemptId}`}>
                          Open
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}

            {nextCursor && (
              <div className="buttonRow">
                <button className="button" type="button" onClick={() => void loadMore()}>
                  {isLoadingMore ? 'Loading...' : 'Load more'}
                </button>
              </div>
            )}
          </>
        )}
      </section>
    </main>
  );
}
