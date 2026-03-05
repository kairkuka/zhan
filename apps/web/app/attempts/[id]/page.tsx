'use client';

import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useCallback, useEffect, useMemo, useState } from 'react';

import { RequireAuth } from '../../../components/RequireAuth';
import { getAttemptById, getReadableErrorMessage, isAbortError } from '../../../lib/api';
import { useRequireAuth } from '../../../lib/useAuth';
import type { AttemptAnswerDetail, AttemptDetail } from '../../../types/api';

type PageStatus = 'loading' | 'ready' | 'error';

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

function questionAttemptKey(attemptId: string, questionAttempt: AttemptAnswerDetail, index: number): string {
  return `${attemptId}:${questionAttempt.questionId ?? 'unknown'}:${index}`;
}

export default function AttemptDetailPage() {
  const params = useParams<{ id: string }>();
  const attemptId = useMemo(() => params.id ?? '', [params.id]);

  const { isAuthenticated } = useRequireAuth();

  const [attempt, setAttempt] = useState<AttemptDetail | null>(null);
  const [status, setStatus] = useState<PageStatus>('loading');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const loadAttempt = useCallback(
    async (signal?: AbortSignal) => {
      if (!attemptId) {
        setStatus('error');
        setErrorMessage('Missing attempt id');
        return;
      }

      setStatus('loading');
      setErrorMessage(null);

      try {
        const response = await getAttemptById(attemptId, { signal });
        if (signal?.aborted) {
          return;
        }

        setAttempt(response);
        setStatus('ready');
      } catch (error) {
        if (isAbortError(error) || signal?.aborted) {
          return;
        }

        setStatus('error');
        setErrorMessage(getReadableErrorMessage(error, 'Failed to load attempt detail.'));
      }
    },
    [attemptId],
  );

  useEffect(() => {
    if (!isAuthenticated || !attemptId) {
      return;
    }

    const controller = new AbortController();
    void loadAttempt(controller.signal);

    return () => {
      controller.abort();
    };
  }, [attemptId, isAuthenticated, loadAttempt]);

  const questionAttempts = attempt?.questionAttempts ?? [];

  return (
    <RequireAuth>
      <main className="page">
        <section className="panel">
          <div className="headerRow">
            <h1>Attempt detail</h1>
            <div className="buttonRow">
              <Link className="buttonSecondary" href="/attempts">
                Back to attempts
              </Link>
              <button
                className="buttonSecondary"
                type="button"
                onClick={() => void loadAttempt()}
                disabled={status === 'loading'}
              >
                Retry
              </button>
            </div>
          </div>

          {status === 'loading' && <p className="muted">Loading attempt detail...</p>}

          {status === 'error' && (
            <section className="card">
              <h2 className="cardTitle">Unable to load attempt detail</h2>
              <p className="errorText">{errorMessage}</p>
            </section>
          )}

          {status === 'ready' && attempt && (
            <div className="stack">
              <section className="card">
                <h2 className="cardTitle">Attempt metadata</h2>
                <dl className="statsGrid">
                  <div className="statItem">
                    <dt>Attempt ID</dt>
                    <dd>
                      <code>{attempt.attemptId}</code>
                    </dd>
                  </div>
                  <div className="statItem">
                    <dt>Assignment ID</dt>
                    <dd>
                      <code>{attempt.assignmentId ?? '—'}</code>
                    </dd>
                  </div>
                  <div className="statItem">
                    <dt>Student ID</dt>
                    <dd>
                      <code>{attempt.studentId ?? '—'}</code>
                    </dd>
                  </div>
                  <div className="statItem">
                    <dt>Status</dt>
                    <dd>{attempt.status ?? '—'}</dd>
                  </div>
                  <div className="statItem">
                    <dt>Started</dt>
                    <dd>{formatDate(attempt.createdAt)}</dd>
                  </div>
                  <div className="statItem">
                    <dt>Submitted</dt>
                    <dd>{formatDate(attempt.submittedAt)}</dd>
                  </div>
                  <div className="statItem">
                    <dt>Total score</dt>
                    <dd>{attempt.totalScore ?? '—'}</dd>
                  </div>
                </dl>
              </section>

              <section className="card">
                <h2 className="cardTitle">Question attempts</h2>
                {questionAttempts.length === 0 ? (
                  <p className="muted">No question attempt payload available for this attempt.</p>
                ) : (
                  <table className="table">
                    <thead>
                      <tr>
                        <th>Question ID</th>
                        <th>Score</th>
                        <th>Feedback</th>
                      </tr>
                    </thead>
                    <tbody>
                      {questionAttempts.map((questionAttempt, index) => (
                        <tr key={questionAttemptKey(attempt.attemptId, questionAttempt, index)}>
                          <td>
                            <code>{questionAttempt.questionId ?? '—'}</code>
                          </td>
                          <td>{questionAttempt.score ?? '—'}</td>
                          <td>{questionAttempt.feedback ?? '—'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </section>
            </div>
          )}
        </section>
      </main>
    </RequireAuth>
  );
}
