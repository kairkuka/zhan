'use client';

import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useRef, useState } from 'react';

import { getToken, logout } from './api';

export type AuthGuardState = 'checking' | 'authenticated' | 'unauthenticated';
const TOKEN_STORAGE_KEY = 'jwt';

export function useRequireAuth(): {
  authState: AuthGuardState;
  isAuthenticated: boolean;
  isChecking: boolean;
} {
  const router = useRouter();
  const hasRedirectedRef = useRef(false);
  const [token, setToken] = useState<string | null | undefined>(undefined);
  const [authState, setAuthState] = useState<AuthGuardState>('checking');

  useEffect(() => {
    let isMounted = true;

    const syncToken = () => {
      if (!isMounted) {
        return;
      }

      setToken(getToken());
    };

    syncToken();

    const handleStorage = (event: StorageEvent) => {
      if (event.key !== null && event.key !== TOKEN_STORAGE_KEY) {
        return;
      }

      syncToken();
    };

    window.addEventListener('storage', handleStorage);

    return () => {
      isMounted = false;
      window.removeEventListener('storage', handleStorage);
    };
  }, []);

  useEffect(() => {
    let isMounted = true;

    if (token === undefined) {
      return () => {
        isMounted = false;
      };
    }

    if (!token) {
      if (!hasRedirectedRef.current) {
        hasRedirectedRef.current = true;
        router.replace('/login');
      }

      if (isMounted) {
        setAuthState('unauthenticated');
      }
    } else {
      hasRedirectedRef.current = false;

      if (isMounted) {
        setAuthState('authenticated');
      }
    }

    return () => {
      isMounted = false;
    };
  }, [router, token]);

  return {
    authState,
    isAuthenticated: authState === 'authenticated',
    isChecking: authState === 'checking',
  };
}

export function useLogout(): () => void {
  const router = useRouter();

  return useCallback(() => {
    logout();
    router.replace('/login');
  }, [router]);
}
