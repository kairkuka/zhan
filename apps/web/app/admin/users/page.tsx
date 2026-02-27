'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';

type OrgUser = {
  id: string;
  email: string;
  role: string;
  organizationId: string;
};

type AdminUsersResponse = {
  users: OrgUser[];
};

const apiBaseUrl = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';
const tokenStorageKey = 'skyvern.token';

export default function AdminUsersPage() {
  const [users, setUsers] = useState<OrgUser[]>([]);
  const [message, setMessage] = useState('');

  async function loadUsers() {
    const token = window.localStorage.getItem(tokenStorageKey);

    if (!token) {
      setMessage('No token found. Login first at /login.');
      setUsers([]);
      return;
    }

    try {
      const response = await fetch(`${apiBaseUrl}/admin/org/users`, {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      const payload = (await response.json()) as AdminUsersResponse;
      setUsers(payload.users);
      setMessage(`Loaded ${payload.users.length} users.`);
    } catch (error) {
      const details = error instanceof Error ? error.message : 'Unknown error';
      setUsers([]);
      setMessage(`Failed to load users: ${details}`);
    }
  }

  useEffect(() => {
    void loadUsers();
  }, []);

  return (
    <main className="container">
      <h1>Admin: Organization Users</h1>
      <p>
        <Link href="/">Home</Link> | <Link href="/login">Login</Link>
      </p>
      <button type="button" onClick={() => void loadUsers()}>
        Reload
      </button>
      {message && <p>{message}</p>}
      <ul>
        {users.map((user) => (
          <li key={user.id}>
            {user.email} ({user.role})
          </li>
        ))}
      </ul>
    </main>
  );
}
