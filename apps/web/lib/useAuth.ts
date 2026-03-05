'use client';

import { useRouter } from 'next/navigation';
import { useCallback } from 'react';

import { useAuth as useAuthContext } from '../components/AuthProvider';

export type AuthGuardState = 'checking' | 'authenticated' | 'unauthenticated';

export function useAuth() {
  return useAuthContext();
}

export function useRequireAuth(): {
  authState: AuthGuardState;
  isAuthenticated: boolean;
  isChecking: boolean;
  sessionMessage: string | null;
} {
  const { status, sessionMessage } = useAuthContext();

  const authState: AuthGuardState =
    status === 'unknown'
      ? 'checking'
      : status === 'authed'
        ? 'authenticated'
        : 'unauthenticated';

  return {
    authState,
    isAuthenticated: status === 'authed',
    isChecking: status === 'unknown',
    sessionMessage,
  };
}

export function useLogout(): () => void {
  const { logout } = useAuthContext();
  const router = useRouter();

  return useCallback(() => {
    logout();
    router.replace('/login');
  }, [logout, router]);
}
