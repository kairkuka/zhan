const TOKEN_STORAGE_KEY = 'jwt';
const LEGACY_TOKEN_STORAGE_KEYS = ['skyvern.token'] as const;

type TokenListener = (token: string | null) => void;

const tokenListeners = new Set<TokenListener>();
let memoryToken: string | null = null;
let isInitialized = false;

function readTokenFromStorage(): string | null {
  if (typeof window === 'undefined') {
    return null;
  }

  const primaryToken = window.localStorage.getItem(TOKEN_STORAGE_KEY);
  if (primaryToken) {
    return primaryToken;
  }

  for (const legacyKey of LEGACY_TOKEN_STORAGE_KEYS) {
    const legacyToken = window.localStorage.getItem(legacyKey);
    if (legacyToken) {
      return legacyToken;
    }
  }

  return null;
}

function writeTokenToStorage(token: string): void {
  if (typeof window === 'undefined') {
    return;
  }

  window.localStorage.setItem(TOKEN_STORAGE_KEY, token);

  for (const legacyKey of LEGACY_TOKEN_STORAGE_KEYS) {
    window.localStorage.removeItem(legacyKey);
  }
}

function clearTokenFromStorage(): void {
  if (typeof window === 'undefined') {
    return;
  }

  window.localStorage.removeItem(TOKEN_STORAGE_KEY);

  for (const legacyKey of LEGACY_TOKEN_STORAGE_KEYS) {
    window.localStorage.removeItem(legacyKey);
  }
}

function notifyTokenListeners(token: string | null): void {
  for (const listener of tokenListeners) {
    listener(token);
  }
}

export function initializeSessionToken(): string | null {
  if (isInitialized) {
    return memoryToken;
  }

  memoryToken = readTokenFromStorage();
  isInitialized = true;

  return memoryToken;
}

export function getSessionToken(): string | null {
  if (!isInitialized) {
    return initializeSessionToken();
  }

  return memoryToken;
}

export function setSessionToken(token: string): void {
  memoryToken = token;
  isInitialized = true;
  writeTokenToStorage(token);
  notifyTokenListeners(token);
}

export function clearSessionToken(): void {
  memoryToken = null;
  isInitialized = true;
  clearTokenFromStorage();
  notifyTokenListeners(null);
}

export function syncSessionTokenFromStorage(): string | null {
  const tokenFromStorage = readTokenFromStorage();
  memoryToken = tokenFromStorage;
  isInitialized = true;
  notifyTokenListeners(tokenFromStorage);

  return tokenFromStorage;
}

export function subscribeSessionToken(listener: TokenListener): () => void {
  tokenListeners.add(listener);

  return () => {
    tokenListeners.delete(listener);
  };
}

export function getTokenStorageKey(): string {
  return TOKEN_STORAGE_KEY;
}
