'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';

import { getReadableErrorMessage, isAbortError, listCurriculum } from '../../lib/api';
import { useRequireAuth } from '../../lib/useAuth';
import type { CurriculumListItem } from '../../types/api';

type PageStatus = 'loading' | 'ready' | 'error';

const PAGE_LIMIT = 50;

function formatDate(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return date.toLocaleString();
}

export default function CurriculumPage() {
  const { isAuthenticated, isChecking } = useRequireAuth();

  const [items, setItems] = useState<CurriculumListItem[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [status, setStatus] = useState<PageStatus>('loading');
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const loadInitial = useCallback(async (signal?: AbortSignal) => {
    setStatus('loading');
    setErrorMessage(null);

    try {
      const response = await listCurriculum({
        limit: PAGE_LIMIT,
        signal,
      });

      if (signal?.aborted) {
        return;
      }

      setItems(response.items);
      setNextCursor(response.nextCursor);
      setStatus('ready');
    } catch (error) {
      if (isAbortError(error) || signal?.aborted) {
        return;
      }

      setStatus('error');
      setErrorMessage(getReadableErrorMessage(error, 'Failed to load curriculum.'));
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
      const response = await listCurriculum({
        cursor: nextCursor,
        limit: PAGE_LIMIT,
      });

      setItems((previous) => [...previous, ...response.items]);
      setNextCursor(response.nextCursor);
    } catch (error) {
      setErrorMessage(getReadableErrorMessage(error, 'Failed to load more curriculum records.'));
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
          <h1>Curriculum</h1>
          <button
            className="buttonSecondary"
            type="button"
            onClick={() => void loadInitial()}
            disabled={status === 'loading'}
          >
            Retry
          </button>
        </div>

        <p className="muted">Subjects in the current organization with unit counts.</p>

        {status === 'loading' && <p className="muted">Loading curriculum...</p>}

        {status === 'error' && (
          <section className="card">
            <h2 className="cardTitle">Unable to load curriculum</h2>
            <p className="errorText">{errorMessage}</p>
          </section>
        )}

        {status === 'ready' && (
          <>
            {items.length === 0 ? (
              <section className="card">
                <h2 className="cardTitle">No curriculum yet</h2>
                <p className="muted">Create subjects in the API to see curriculum here.</p>
              </section>
            ) : (
              <table className="table">
                <thead>
                  <tr>
                    <th>Name</th>
                    <th>Units</th>
                    <th>Created</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((item) => (
                    <tr key={item.id}>
                      <td>{item.name}</td>
                      <td>{item.unitsCount}</td>
                      <td>{formatDate(item.createdAt)}</td>
                      <td>
                        <Link className="buttonLink" href={`/curriculum/${item.id}`}>
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
