import Link from 'next/link';

export default function NotFoundPage() {
  return (
    <main className="page">
      <section className="panel">
        <h1>Page not found</h1>
        <p className="muted">The page you requested does not exist or has been moved.</p>
        <div className="buttonRow">
          <Link className="button" href="/dashboard">
            Back to dashboard
          </Link>
          <Link className="buttonSecondary" href="/students">
            Open students
          </Link>
        </div>
      </section>
    </main>
  );
}
