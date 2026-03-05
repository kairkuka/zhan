'use client';

import { useRequireAuth } from '../../lib/useAuth';

export default function AttemptsPage() {
  const { isAuthenticated, isChecking } = useRequireAuth();

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
        <h1>Attempts</h1>
        <p className="muted">Attempts UI coming next.</p>

        <section className="card">
          <h2 className="cardTitle">Planned surface</h2>
          <ul className="listMuted">
            <li>Assignment attempts list with status and score metadata.</li>
            <li>Per-attempt question breakdown and feedback visibility.</li>
            <li>Teacher/Admin analytics summaries aligned with backend contracts.</li>
          </ul>
        </section>
      </section>
    </main>
  );
}
