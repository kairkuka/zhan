'use client';

import { useRequireAuth } from '../../lib/useAuth';

export default function CurriculumPage() {
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
        <h1>Curriculum</h1>
        <p className="muted">Curriculum UI coming next.</p>

        <section className="card">
          <h2 className="cardTitle">Planned surface</h2>
          <ul className="listMuted">
            <li>Subject → Unit → Topic → Skill hierarchy viewer.</li>
            <li>Curriculum skill picker integration for assignment question tags.</li>
            <li>Organization-scoped editing with ADMIN and TEACHER permissions.</li>
          </ul>
        </section>
      </section>
    </main>
  );
}
