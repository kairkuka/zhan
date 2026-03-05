'use client';

import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';

import { getToken, logout } from './api';

export function useRequireAuth(): boolean {
  const router = useRouter();
  const [isAuthenticated, setIsAuthenticated] = useState(false);

  useEffect(() => {
    if (!getToken()) {
      router.replace('/login');
      return;
    }

    setIsAuthenticated(true);
  }, [router]);

  return isAuthenticated;
}

export function useLogout(): () => void {
  const router = useRouter();

  return useCallback(() => {
    logout();
    router.replace('/login');
  }, [router]);
}
