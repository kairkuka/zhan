'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';

import { getReadableErrorMessage, getToken, listStudents, logout } from '../../lib/api';
import type { Student } from '../../types/api';

type PageState = 'loading' | 'ready' | 'error';

export default function StudentsPage() {
  const router = useRouter();
  const [students, setStudents] = useState<Student[]>([]);
  const [state, setState] = useState<PageState>('loading');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    if (!getToken()) {
      router.replace('/login');
      return;
    }

    void loadStudents();
  }, [router]);

  async function loadStudents() {
    setState('loading');
    setErrorMessage(null);

    try {
      const result = await listStudents();
      setStudents(result);
      setState('ready');
    } catch (error) {
      setState('error');
      setErrorMessage(getReadableErrorMessage(error, 'Failed to load students.'));
    }
  }

  function handleLogout() {
    logout();
    router.replace('/login');
  }

  return (
    <main className="page">
      <section className="panel">
        <div className="headerRow">
          <h1>Students</h1>
          <div className="buttonRow">
            <button className="buttonSecondary" type="button" onClick={() => void loadStudents()}>
              Refresh
            </button>
            <button className="buttonSecondary" type="button" onClick={handleLogout}>
              Logout
            </button>
          </div>
        </div>

        <p className="muted">
          <Link href="/">Home</Link>
        </p>

        {state === 'loading' && <p className="muted">Loading students...</p>}

        {state === 'error' && <p className="errorText">{errorMessage}</p>}

        {state === 'ready' && (
          <>
            {students.length === 0 ? (
              <p className="muted">No students found.</p>
            ) : (
              <table className="table">
                <thead>
                  <tr>
                    <th>Student ID</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {students.map((student) => (
                    <tr key={student.id}>
                      <td>
                        <code>{student.id}</code>
                      </td>
                      <td>
                        <Link className="buttonLink" href={`/students/${student.id}`}>
                          Open
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </>
        )}
      </section>
    </main>
  );
}
