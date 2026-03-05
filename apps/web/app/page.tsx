'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';

import { HealthResponseSchema, type HealthResponse } from '@skyvern/shared';

type HealthState =
  | { status: 'loading'; message: string }
  | { status: 'success'; message: string; data: HealthResponse }
  | { status: 'error'; message: string };

const apiBaseUrl = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';

export default function HomePage() {
  const [health, setHealth] = useState<HealthState>({
    status: 'loading',
    message: 'Checking API health...',
  });

  useEffect(() => {
    const controller = new AbortController();

    async function fetchHealth() {
      try {
        const response = await fetch(`${apiBaseUrl}/health`, {
          signal: controller.signal,
        });

        if (!response.ok) {
          throw new Error(`API returned ${response.status}`);
        }

        const json = await response.json();
        const parsed = HealthResponseSchema.parse(json);

        setHealth({
          status: 'success',
          message: 'API is reachable.',
          data: parsed,
        });
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown error';
        setHealth({
          status: 'error',
          message: `Unable to reach API: ${message}`,
        });
      }
    }

    void fetchHealth();

    return () => {
      controller.abort();
    };
  }, []);

  return (
    <main className="page">
      <section className="panel">
        <h1>Skyvern Front Parity MVP</h1>
        <p className="muted">
          API target: <code>{apiBaseUrl}</code>
        </p>

        <div className="buttonRow">
          <Link className="button" href="/dashboard">
            Open dashboard
          </Link>
          <Link className="buttonSecondary" href="/login">
            Login
          </Link>
          <Link className="buttonSecondary" href="/students">
            Students
          </Link>
        </div>

        {health.status === 'loading' && <p className="muted">{health.message}</p>}
        {health.status === 'error' && <p className="errorText">{health.message}</p>}
        {health.status === 'success' && (
          <p className="success">
            {health.message} Response: <code>{JSON.stringify(health.data)}</code>
          </p>
        )}
      </section>
    </main>
  );
}
