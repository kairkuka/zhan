'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useRef } from 'react';
import type { ReactNode } from 'react';

import { useAuth } from './AuthProvider';

type RequireAuthProps = {
  children: ReactNode;
};

export function RequireAuth({ children }: RequireAuthProps) {
  const router = useRouter();
  const hasRedirectedRef = useRef(false);
  const { status, sessionMessage } = useAuth();

  useEffect(() => {
    if (status === 'authed') {
      hasRedirectedRef.current = false;
      return;
    }

    if (status === 'unauthed' && !hasRedirectedRef.current) {
      hasRedirectedRef.current = true;
      router.replace('/login');
    }
  }, [router, status]);

  if (status === 'unknown') {
    return (
      <main className="page">
        <section className="panel">
          <p className="muted">Checking session...</p>
        </section>
      </main>
    );
  }

  if (status === 'unauthed') {
    return (
      <main className="page">
        <section className="panel">
          <p className="muted">Redirecting to login...</p>
          {sessionMessage && <p className="muted">{sessionMessage}</p>}
        </section>
      </main>
    );
  }

  return <>{children}</>;
}
