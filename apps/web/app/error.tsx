'use client';

import Link from 'next/link';

type GlobalErrorPageProps = {
  error: Error & { digest?: string };
  reset: () => void;
};

export default function GlobalErrorPage({ error, reset }: GlobalErrorPageProps) {
  return (
    <main className="page">
      <section className="panel">
        <h1>Something went wrong</h1>
        <p className="errorText">{error.message || 'Unexpected application error.'}</p>
        <div className="buttonRow">
          <button className="button" type="button" onClick={reset}>
            Try again
          </button>
          <Link className="buttonSecondary" href="/dashboard">
            Back to dashboard
          </Link>
        </div>
      </section>
    </main>
  );
}
