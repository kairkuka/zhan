'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import type { FormEvent } from 'react';

import { getReadableErrorMessage, getToken, login, setToken } from '../../lib/api';

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState('admin@demo.local');
  const [password, setPassword] = useState('demo12345');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    if (getToken()) {
      router.replace('/dashboard');
    }
  }, [router]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setErrorMessage(null);
    setIsSubmitting(true);

    try {
      const token = await login(email.trim(), password);
      setToken(token);
      router.replace('/dashboard');
    } catch (error) {
      setErrorMessage(getReadableErrorMessage(error, 'Login failed.'));
      setIsSubmitting(false);
    }
  }

  return (
    <main className="page">
      <section className="panel">
        <h1>Login</h1>
        <p className="muted">
          Use demo admin credentials to access students and analytics.
        </p>

        <form className="form" onSubmit={handleSubmit}>
          <label className="field">
            <span>Email</span>
            <input
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              autoComplete="email"
              required
            />
          </label>

          <label className="field">
            <span>Password</span>
            <input
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              autoComplete="current-password"
              required
            />
          </label>

          <div className="buttonRow">
            <button className="button" type="submit" disabled={isSubmitting}>
              {isSubmitting ? 'Signing in...' : 'Login'}
            </button>
            <Link className="buttonSecondary" href="/">
              Home
            </Link>
          </div>
        </form>

        {errorMessage && <p className="errorText">{errorMessage}</p>}
      </section>
    </main>
  );
}
