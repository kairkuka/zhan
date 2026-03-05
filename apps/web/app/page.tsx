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
    <main className="container">
      <h1>Skyvern Stage 1 - Block 2</h1>
      <p>Web app is running.</p>
      <p>
        API target: <code>{apiBaseUrl}</code>
      </p>
      <p>
        <Link href="/login">Go to login</Link> | <Link href="/students">Open students</Link>
      </p>

      {health.status === 'loading' && <p>{health.message}</p>}
      {health.status === 'error' && <p className="error">{health.message}</p>}
      {health.status === 'success' && (
        <p className="success">
          {health.message} Response: <code>{JSON.stringify(health.data)}</code>
        </p>
      )}
    </main>
  );
}
