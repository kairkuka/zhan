'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import type { FormEvent } from 'react';

type LoginResponse = {
  token: string;
  user: {
    id: string;
    email: string;
    role: string;
    organizationId: string;
  };
};

type MeResponse = {
  id: string;
  email: string;
  role: string;
  organizationId: string;
};

const apiBaseUrl = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';
const tokenStorageKey = 'skyvern.token';

export default function LoginPage() {
  const [email, setEmail] = useState('admin@demo.local');
  const [password, setPassword] = useState('demo12345');
  const [token, setToken] = useState<string | null>(null);
  const [me, setMe] = useState<MeResponse | null>(null);
  const [message, setMessage] = useState('');

  useEffect(() => {
    const storedToken = window.localStorage.getItem(tokenStorageKey);

    if (!storedToken) {
      return;
    }

    setToken(storedToken);
    void loadMe(storedToken);
  }, []);

  async function loadMe(authToken: string) {
    try {
      const response = await fetch(`${apiBaseUrl}/me`, {
        headers: {
          Authorization: `Bearer ${authToken}`,
        },
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      const data = (await response.json()) as MeResponse;
      setMe(data);
      setMessage('Authenticated successfully.');
    } catch (error) {
      const details = error instanceof Error ? error.message : 'Unknown error';
      setMessage(`Failed to load /me: ${details}`);
    }
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage('Signing in...');

    try {
      const response = await fetch(`${apiBaseUrl}/auth/login`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ email, password }),
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      const payload = (await response.json()) as LoginResponse;
      window.localStorage.setItem(tokenStorageKey, payload.token);
      setToken(payload.token);
      await loadMe(payload.token);
    } catch (error) {
      const details = error instanceof Error ? error.message : 'Unknown error';
      setMessage(`Login failed: ${details}`);
    }
  }

  function handleLogout() {
    window.localStorage.removeItem(tokenStorageKey);
    setToken(null);
    setMe(null);
    setMessage('Token removed from localStorage.');
  }

  return (
    <main className="container">
      <h1>Login</h1>
      <p>
        <Link href="/">Home</Link> | <Link href="/admin/users">Admin users</Link>
      </p>
      <form onSubmit={handleSubmit}>
        <p>
          <label htmlFor="email">Email</label>
          <br />
          <input
            id="email"
            type="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            required
          />
        </p>
        <p>
          <label htmlFor="password">Password</label>
          <br />
          <input
            id="password"
            type="password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            required
          />
        </p>
        <button type="submit">Login</button>{' '}
        <button type="button" onClick={handleLogout}>
          Logout
        </button>
      </form>

      {message && <p>{message}</p>}
      <p>
        Token: <code>{token ? `${token.slice(0, 28)}...` : 'not set'}</code>
      </p>
      <p>
        Current user:{' '}
        <code>{me ? JSON.stringify(me) : 'not loaded'}</code>
      </p>
    </main>
  );
}
