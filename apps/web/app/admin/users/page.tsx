'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';

import { RequireAuth } from '../../../components/RequireAuth';
import { apiFetch, getToken, getReadableErrorMessage } from '../../../lib/api';
import { useRequireAuth } from '../../../lib/useAuth';

type OrgUser = {
  id: string;
  email: string;
  role: string;
  organizationId: string;
};

type AdminUsersResponse = {
  users: OrgUser[];
};

export default function AdminUsersPage() {
  const { isAuthenticated } = useRequireAuth();
  const [users, setUsers] = useState<OrgUser[]>([]);
  const [message, setMessage] = useState('');

  async function loadUsers() {
    const token = getToken();

    if (!token) {
      setMessage('No token found. Login first at /login.');
      setUsers([]);
      return;
    }

    try {
      const payload = await apiFetch<AdminUsersResponse>('/admin/org/users', {
        method: 'GET',
      });
      setUsers(payload.users);
      setMessage(`Loaded ${payload.users.length} users.`);
    } catch (error) {
      setUsers([]);
      setMessage(getReadableErrorMessage(error, 'Failed to load users.'));
    }
  }

  useEffect(() => {
    if (!isAuthenticated) {
      return;
    }

    void loadUsers();
  }, [isAuthenticated]);

  return (
    <RequireAuth>
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
    </RequireAuth>
  );
}
