'use client';

import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useCallback, useEffect, useMemo, useState } from 'react';

import { getCurriculumById, getReadableErrorMessage, isAbortError } from '../../../lib/api';
import { useRequireAuth } from '../../../lib/useAuth';
import type { CurriculumDetail } from '../../../types/api';

type PageStatus = 'loading' | 'ready' | 'error';

function formatDate(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return date.toLocaleString();
}

export default function CurriculumDetailPage() {
  const params = useParams<{ id: string }>();
  const curriculumId = useMemo(() => params.id ?? '', [params.id]);

  const { isAuthenticated, isChecking } = useRequireAuth();

  const [curriculum, setCurriculum] = useState<CurriculumDetail | null>(null);
  const [status, setStatus] = useState<PageStatus>('loading');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const loadCurriculum = useCallback(
    async (signal?: AbortSignal) => {
      if (!curriculumId) {
        setStatus('error');
        setErrorMessage('Missing curriculum id');
        return;
      }

      setStatus('loading');
      setErrorMessage(null);

      try {
        const result = await getCurriculumById(curriculumId, { signal });
        if (signal?.aborted) {
          return;
        }

        setCurriculum(result);
        setStatus('ready');
      } catch (error) {
        if (isAbortError(error) || signal?.aborted) {
          return;
        }

        setStatus('error');
        setErrorMessage(getReadableErrorMessage(error, 'Failed to load curriculum detail.'));
      }
    },
    [curriculumId],
  );

  useEffect(() => {
    if (!isAuthenticated || !curriculumId) {
      return;
    }

    const controller = new AbortController();
    void loadCurriculum(controller.signal);

    return () => {
      controller.abort();
    };
  }, [curriculumId, isAuthenticated, loadCurriculum]);

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
          <h1>Curriculum detail</h1>
          <div className="buttonRow">
            <Link className="buttonSecondary" href="/curriculum">
              Back to curriculum
            </Link>
            <button
              className="buttonSecondary"
              type="button"
              onClick={() => void loadCurriculum()}
              disabled={status === 'loading'}
            >
              Retry
            </button>
          </div>
        </div>

        {status === 'loading' && <p className="muted">Loading curriculum detail...</p>}

        {status === 'error' && (
          <section className="card">
            <h2 className="cardTitle">Unable to load curriculum detail</h2>
            <p className="errorText">{errorMessage}</p>
          </section>
        )}

        {status === 'ready' && curriculum && (
          <div className="stack">
            <section className="card">
              <h2 className="cardTitle">{curriculum.name}</h2>
              <p className="muted">
                Subject ID: <code>{curriculum.id}</code>
              </p>
              <p className="muted">Created: {formatDate(curriculum.createdAt)}</p>
              <p className="muted">Units: {curriculum.units.length}</p>
            </section>

            {curriculum.units.map((unit) => (
              <section className="card" key={unit.id}>
                <h2 className="cardTitle">
                  Unit {unit.order}: {unit.name}
                </h2>

                {unit.topics.length === 0 ? (
                  <p className="muted">No topics.</p>
                ) : (
                  <div className="stack">
                    {unit.topics.map((topic) => (
                      <section key={topic.id} className="card">
                        <h3>
                          Topic {topic.order}: {topic.name}
                        </h3>
                        {topic.skills.length === 0 ? (
                          <p className="muted">No skills.</p>
                        ) : (
                          <ul className="listMuted">
                            {topic.skills.map((skill) => (
                              <li key={skill.id}>
                                {skill.name} (<code>{skill.id}</code>)
                                {skill.questionTags.length > 0 && (
                                  <>
                                    {' '}
                                    — tags:{' '}
                                    {skill.questionTags.map((tag) => tag.questionId).join(', ')}
                                  </>
                                )}
                              </li>
                            ))}
                          </ul>
                        )}
                      </section>
                    ))}
                  </div>
                )}
              </section>
            ))}
          </div>
        )}
      </section>
    </main>
  );
}
