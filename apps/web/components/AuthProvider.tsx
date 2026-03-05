'use client';

import { useRouter } from 'next/navigation';
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import type { ReactNode } from 'react';

import { getReadableErrorMessage, getSessionUser, isAbortError, logout, setToken, setUnauthorizedHandler } from '../lib/api';
import {
  getTokenStorageKey,
  initializeSessionToken,
  subscribeSessionToken,
  syncSessionTokenFromStorage,
} from '../lib/authSession';
import type { AuthUser } from '../types/api';

export type AuthStatus = 'unknown' | 'authed' | 'unauthed';

type AuthContextValue = {
  status: AuthStatus;
  token: string | null;
  user?: AuthUser;
  sessionMessage: string | null;
  login: (token: string) => void;
  logout: () => void;
};

const AuthContext = createContext<AuthContextValue | undefined>(undefined);
const LEGACY_TOKEN_STORAGE_KEY = 'skyvern.token';

type AuthProviderProps = {
  children: ReactNode;
};

export function AuthProvider({ children }: AuthProviderProps) {
  const router = useRouter();
  const hasRedirectedRef = useRef(false);
  const [token, setTokenState] = useState<string | null | undefined>(undefined);
  const [status, setStatus] = useState<AuthStatus>('unknown');
  const [user, setUser] = useState<AuthUser | undefined>(undefined);
  const [sessionMessage, setSessionMessage] = useState<string | null>(null);

  const handleLogout = useCallback(() => {
    logout();
    setStatus('unauthed');
    setUser(undefined);
  }, []);

  const handleLogin = useCallback((nextToken: string) => {
    setSessionMessage(null);
    setStatus('unknown');
    setToken(nextToken);
  }, []);

  useEffect(() => {
    const tokenFromStorage = initializeSessionToken();
    setTokenState(tokenFromStorage);

    const unsubscribe = subscribeSessionToken((nextToken) => {
      setTokenState(nextToken);
    });

    const tokenStorageKey = getTokenStorageKey();

    const handleStorage = (event: StorageEvent) => {
      if (
        event.key !== null &&
        event.key !== tokenStorageKey &&
        event.key !== LEGACY_TOKEN_STORAGE_KEY
      ) {
        return;
      }

      syncSessionTokenFromStorage();
    };

    window.addEventListener('storage', handleStorage);

    return () => {
      unsubscribe();
      window.removeEventListener('storage', handleStorage);
    };
  }, []);

  useEffect(() => {
    if (token === undefined) {
      return;
    }

    if (token === null) {
      setStatus('unauthed');
      setUser(undefined);
      return;
    }

    const controller = new AbortController();
    let isMounted = true;

    setStatus('unknown');

    async function validateSession() {
      try {
        const nextUser = await getSessionUser({ signal: controller.signal });

        if (!isMounted || controller.signal.aborted) {
          return;
        }

        setUser(nextUser);
        setStatus('authed');
        setSessionMessage(null);
      } catch (error) {
        if (!isMounted || controller.signal.aborted || isAbortError(error)) {
          return;
        }

        handleLogout();
        setSessionMessage(getReadableErrorMessage(error, 'Session validation failed.'));
      }
    }

    void validateSession();

    return () => {
      isMounted = false;
      controller.abort();
    };
  }, [handleLogout, token]);

  useEffect(() => {
    const unregister = setUnauthorizedHandler(() => {
      handleLogout();
      setSessionMessage('Session expired. Please login again.');

      if (!hasRedirectedRef.current && window.location.pathname !== '/login') {
        hasRedirectedRef.current = true;
        router.replace('/login');
      }
    });

    return unregister;
  }, [handleLogout, router]);

  useEffect(() => {
    if (status === 'authed') {
      hasRedirectedRef.current = false;
    }
  }, [status]);

  const contextValue = useMemo<AuthContextValue>(
    () => ({
      status,
      token: token ?? null,
      user,
      sessionMessage,
      login: handleLogin,
      logout: handleLogout,
    }),
    [handleLogin, handleLogout, sessionMessage, status, token, user],
  );

  return <AuthContext.Provider value={contextValue}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);

  if (!context) {
    throw new Error('useAuth must be used within AuthProvider');
  }

  return context;
}
