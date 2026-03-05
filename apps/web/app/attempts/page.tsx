'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useState } from 'react';
import type { FormEvent } from 'react';

import { RequireAuth } from '../../components/RequireAuth';
import { getReadableErrorMessage, isAbortError, listAttempts } from '../../lib/api';
import { useRequireAuth } from '../../lib/useAuth';
import type { AttemptListItem } from '../../types/api';

type PageStatus = 'loading' | 'ready' | 'error';

type AttemptFilters = {
  studentId: string;
  assignmentId: string;
};

const PAGE_LIMIT = 50;
const EMPTY_FILTERS: AttemptFilters = {
  studentId: '',
  assignmentId: '',
};

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

export default function AttemptsPage() {
  const { isAuthenticated } = useRequireAuth();

  const [attempts, setAttempts] = useState<AttemptListItem[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [status, setStatus] = useState<PageStatus>('loading');
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [filters, setFilters] = useState<AttemptFilters>(EMPTY_FILTERS);
  const [activeFilters, setActiveFilters] = useState<AttemptFilters>(EMPTY_FILTERS);

  const hasActiveFilters = useMemo(
    () => activeFilters.studentId.length > 0 || activeFilters.assignmentId.length > 0,
    [activeFilters.assignmentId, activeFilters.studentId],
  );

  const loadAttempts = useCallback(
    async (params: {
      targetFilters: AttemptFilters;
      signal?: AbortSignal;
      cursor?: string;
      append?: boolean;
    }) => {
      const { targetFilters, signal, cursor, append = false } = params;

      if (!append) {
        setStatus('loading');
      }
      setErrorMessage(null);

      try {
        const response = await listAttempts({
          cursor,
          limit: PAGE_LIMIT,
          studentId: targetFilters.studentId || undefined,
          assignmentId: targetFilters.assignmentId || undefined,
          signal,
        });

        if (signal?.aborted) {
          return;
        }

        if (append) {
          setAttempts((previous) => [...previous, ...response.items]);
        } else {
          setAttempts(response.items);
          setStatus('ready');
        }

        setNextCursor(response.nextCursor);
      } catch (error) {
        if (isAbortError(error) || signal?.aborted) {
          return;
        }

        if (!append) {
          setStatus('error');
        }

        setErrorMessage(getReadableErrorMessage(error, 'Failed to load attempts.'));
      }
    },
    [],
  );

  useEffect(() => {
    if (!isAuthenticated) {
      return;
    }

    const controller = new AbortController();
    void loadAttempts({
      targetFilters: activeFilters,
      signal: controller.signal,
    });

    return () => {
      controller.abort();
    };
  }, [activeFilters, isAuthenticated, loadAttempts]);

  const applyFilters = useCallback(
    (event: FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      setActiveFilters({
        studentId: filters.studentId.trim(),
        assignmentId: filters.assignmentId.trim(),
      });
    },
    [filters.assignmentId, filters.studentId],
  );

  const resetFilters = useCallback(() => {
    setFilters(EMPTY_FILTERS);
    setActiveFilters(EMPTY_FILTERS);
  }, []);

  const loadMore = useCallback(async () => {
    if (!nextCursor || isLoadingMore) {
      return;
    }

    setIsLoadingMore(true);
    setErrorMessage(null);

    try {
      await loadAttempts({
        targetFilters: activeFilters,
        cursor: nextCursor,
        append: true,
      });
    } finally {
      setIsLoadingMore(false);
    }
  }, [activeFilters, isLoadingMore, loadAttempts, nextCursor]);

  return (
    <RequireAuth>
      <main className="page">
        <section className="panel">
          <div className="headerRow">
            <h1>Attempts</h1>
            <button
              className="buttonSecondary"
              type="button"
              onClick={() =>
                void loadAttempts({
                  targetFilters: activeFilters,
                })
              }
              disabled={status === 'loading'}
            >
              Retry
            </button>
          </div>

          <p className="muted">Recent attempts in your organization.</p>

          <form className="stack" onSubmit={applyFilters}>
            <div className="buttonRow">
              <label className="field">
                Student ID
                <input
                  type="text"
                  value={filters.studentId}
                  onChange={(event) =>
                    setFilters((previous) => ({
                      ...previous,
                      studentId: event.target.value,
                    }))
                  }
                  placeholder="cuid"
                />
              </label>
              <label className="field">
                Assignment ID
                <input
                  type="text"
                  value={filters.assignmentId}
                  onChange={(event) =>
                    setFilters((previous) => ({
                      ...previous,
                      assignmentId: event.target.value,
                    }))
                  }
                  placeholder="cuid"
                />
              </label>
            </div>
            <div className="buttonRow">
              <button className="button" type="submit" disabled={status === 'loading'}>
                Apply filters
              </button>
              <button className="buttonSecondary" type="button" onClick={resetFilters}>
                Reset
              </button>
            </div>
          </form>

          {hasActiveFilters && (
            <p className="muted">
              Active filters: studentId=<code>{activeFilters.studentId || '—'}</code>, assignmentId=
              <code>{activeFilters.assignmentId || '—'}</code>
            </p>
          )}

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
                      <th>Status</th>
                      <th>Student</th>
                      <th>Assignment</th>
                      <th>Started</th>
                      <th>Submitted</th>
                      <th>Total score</th>
                      <th>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {attempts.map((attempt) => (
                      <tr key={attempt.attemptId}>
                        <td>
                          <code>{attempt.attemptId}</code>
                        </td>
                        <td>{attempt.status}</td>
                        <td>
                          <code>{attempt.studentId}</code>
                        </td>
                        <td>
                          <code>{attempt.assignmentId}</code>
                        </td>
                        <td>{formatDate(attempt.startedAt)}</td>
                        <td>{formatDate(attempt.submittedAt)}</td>
                        <td>{attempt.totalScore}</td>
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
    </RequireAuth>
  );
}
