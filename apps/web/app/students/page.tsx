'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';

import { RequireAuth } from '../../components/RequireAuth';
import { getReadableErrorMessage, isAbortError, listStudents } from '../../lib/api';
import { useRequireAuth } from '../../lib/useAuth';
import type { Student } from '../../types/api';

type PageState = 'loading' | 'ready' | 'error';

export default function StudentsPage() {
  const { isAuthenticated } = useRequireAuth();
  const [students, setStudents] = useState<Student[]>([]);
  const [state, setState] = useState<PageState>('loading');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const loadStudents = useCallback(async (signal?: AbortSignal) => {
    setState('loading');
    setErrorMessage(null);

    try {
      const result = await listStudents({ signal });

      if (signal?.aborted) {
        return;
      }

      setStudents(result);
      setState('ready');
    } catch (error) {
      if (isAbortError(error) || signal?.aborted) {
        return;
      }

      setState('error');
      setErrorMessage(getReadableErrorMessage(error, 'Failed to load students.'));
    }
  }, []);

  useEffect(() => {
    if (!isAuthenticated) {
      return;
    }

    const controller = new AbortController();
    void loadStudents(controller.signal);

    return () => {
      controller.abort();
    };
  }, [isAuthenticated, loadStudents]);

  return (
    <RequireAuth>
      <main className="page">
        <section className="panel">
          <div className="headerRow">
            <h1>Students</h1>
            <button
              className="buttonSecondary"
              type="button"
              onClick={() => void loadStudents()}
              disabled={state === 'loading'}
            >
              Refresh
            </button>
          </div>

          <p className="muted">
            Select a student to open mastery overview and trend analytics.
          </p>

          {state === 'loading' && <p className="muted">Loading students...</p>}

          {state === 'error' && <p className="errorText">{errorMessage}</p>}

          {state === 'ready' && (
            <>
              {students.length === 0 ? (
                <p className="muted">No students found.</p>
              ) : (
                <table className="table">
                  <thead>
                    <tr>
                      <th>Student ID</th>
                      <th>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {students.map((student) => (
                      <tr key={student.id}>
                        <td>
                          <code>{student.id}</code>
                        </td>
                        <td>
                          <Link className="buttonLink" href={`/students/${student.id}`}>
                            Open
                          </Link>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </>
          )}
        </section>
      </main>
    </RequireAuth>
  );
}
