import type { MasteryOverview, MasteryTrendResponse, Student, TrendBucket } from '../types/api';

const API_URL = 'http://localhost:4000';
const TOKEN_STORAGE_KEY = 'jwt';

type ApiFetchOptions = RequestInit & {
  auth?: boolean;
};

type StudentLike = {
  id: string;
};

type LegacyOverviewSkill = {
  currentMastery: number;
  risk?: string;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function toErrorMessage(value: unknown, fallback: string): string {
  if (typeof value === 'string' && value.length > 0) {
    return value;
  }

  return fallback;
}

function parseApiError(payload: unknown, status: number): string {
  if (isRecord(payload)) {
    const message = payload.message;

    if (typeof message === 'string' && message.length > 0) {
      return `API ${status}: ${message}`;
    }

    const nestedError = payload.error;
    if (isRecord(nestedError) && typeof nestedError.message === 'string') {
      return `API ${status}: ${nestedError.message}`;
    }
  }

  if (typeof payload === 'string' && payload.length > 0) {
    return `API ${status}: ${payload}`;
  }

  return `API ${status}: request failed`;
}

function normalizeBuckets(raw: unknown): TrendBucket[] {
  if (!Array.isArray(raw)) {
    throw new Error('Invalid trend response: buckets must be an array');
  }

  const buckets: TrendBucket[] = [];

  for (const item of raw) {
    if (!isRecord(item)) {
      continue;
    }

    const date = item.date;
    const averageMastery = item.averageMastery;
    const skillsTracked = item.skillsTracked;

    if (
      typeof date === 'string' &&
      typeof averageMastery === 'number' &&
      typeof skillsTracked === 'number'
    ) {
      buckets.push({
        date,
        averageMastery,
        skillsTracked,
      });
    }
  }

  return buckets;
}

function normalizeStudents(payload: unknown): Student[] {
  if (Array.isArray(payload)) {
    return payload
      .filter((item): item is StudentLike => isRecord(item) && typeof item.id === 'string')
      .map((item) => ({ id: item.id }));
  }

  if (isRecord(payload) && Array.isArray(payload.students)) {
    return payload.students
      .filter((item): item is StudentLike => isRecord(item) && typeof item.id === 'string')
      .map((item) => ({ id: item.id }));
  }

  throw new Error('Invalid students response');
}

function normalizeOverview(payload: unknown): MasteryOverview {
  if (isRecord(payload)) {
    const averageMastery = payload.averageMastery;
    const skillsTracked = payload.skillsTracked;
    const riskLevel = payload.riskLevel;

    if (typeof averageMastery === 'number' && typeof skillsTracked === 'number') {
      return {
        averageMastery,
        skillsTracked,
        riskLevel: typeof riskLevel === 'string' ? riskLevel : undefined,
      };
    }

    if (Array.isArray(payload.skills)) {
      const skills = payload.skills.filter(
        (item): item is LegacyOverviewSkill =>
          isRecord(item) && typeof item.currentMastery === 'number',
      );

      const masterySum = skills.reduce((sum, item) => sum + item.currentMastery, 0);
      const average = skills.length > 0 ? masterySum / skills.length : 0;

      const priority = new Map<string, number>([
        ['HIGH', 3],
        ['MEDIUM', 2],
        ['LOW', 1],
      ]);

      let currentRisk: string | undefined;
      let currentPriority = 0;
      for (const item of skills) {
        if (!item.risk) {
          continue;
        }

        const score = priority.get(item.risk.toUpperCase()) ?? 0;
        if (score > currentPriority) {
          currentPriority = score;
          currentRisk = item.risk;
        }
      }

      return {
        averageMastery: average,
        skillsTracked: skills.length,
        riskLevel: currentRisk,
      };
    }
  }

  throw new Error('Invalid mastery overview response');
}

function normalizeTrendResponse(payload: unknown): MasteryTrendResponse {
  if (!isRecord(payload)) {
    throw new Error('Invalid mastery trend response');
  }

  const buckets = normalizeBuckets(payload.buckets);
  const nextCursorRaw = payload.nextCursor;

  return {
    buckets,
    nextCursor:
      typeof nextCursorRaw === 'string' || nextCursorRaw === null ? nextCursorRaw : undefined,
  };
}

function ensureToken(): string {
  const token = getToken();
  if (!token) {
    throw new Error('Authentication token is missing. Please login again.');
  }

  return token;
}

function buildApiUrl(path: string): string {
  if (path.startsWith('http://') || path.startsWith('https://')) {
    return path;
  }

  const normalizedPath = path.startsWith('/') ? path : `/${path}`;
  return `${API_URL}${normalizedPath}`;
}

export function getToken(): string | null {
  if (typeof window === 'undefined') {
    return null;
  }

  return window.localStorage.getItem(TOKEN_STORAGE_KEY);
}

export function setToken(token: string): void {
  if (typeof window === 'undefined') {
    return;
  }

  window.localStorage.setItem(TOKEN_STORAGE_KEY, token);
}

export function logout(): void {
  if (typeof window === 'undefined') {
    return;
  }

  window.localStorage.removeItem(TOKEN_STORAGE_KEY);
}

export async function apiFetch<T>(path: string, options: ApiFetchOptions = {}): Promise<T> {
  const { auth = true, headers, ...requestOptions } = options;

  const requestHeaders = new Headers(headers ?? {});
  const hasBody = requestOptions.body !== undefined;

  if (hasBody && !requestHeaders.has('Content-Type') && !(requestOptions.body instanceof FormData)) {
    requestHeaders.set('Content-Type', 'application/json');
  }

  if (auth) {
    requestHeaders.set('Authorization', `Bearer ${ensureToken()}`);
  }

  const response = await fetch(buildApiUrl(path), {
    ...requestOptions,
    headers: requestHeaders,
  });

  const text = await response.text();
  const payload: unknown =
    text.length > 0
      ? (() => {
          try {
            return JSON.parse(text) as unknown;
          } catch {
            return text;
          }
        })()
      : null;

  if (!response.ok) {
    throw new Error(parseApiError(payload, response.status));
  }

  return payload as T;
}

export async function login(email: string, password: string): Promise<string> {
  const payload = await apiFetch<unknown>('/auth/login', {
    method: 'POST',
    auth: false,
    body: JSON.stringify({ email, password }),
  });

  if (isRecord(payload) && typeof payload.token === 'string') {
    return payload.token;
  }

  throw new Error('Invalid login response: token is missing');
}

export async function listStudents(): Promise<Student[]> {
  const payload = await apiFetch<unknown>('/students');
  return normalizeStudents(payload);
}

export async function getStudentMasteryOverview(studentId: string): Promise<MasteryOverview> {
  const payload = await apiFetch<unknown>(`/students/${studentId}/mastery-overview`);
  return normalizeOverview(payload);
}

export async function getStudentMasteryTrend(params: {
  studentId: string;
  bucket?: 'day' | 'week' | 'month';
  cursor?: string;
  limit?: number;
}): Promise<MasteryTrendResponse> {
  const search = new URLSearchParams();
  search.set('bucket', params.bucket ?? 'week');

  if (params.cursor) {
    search.set('cursor', params.cursor);
  }

  if (typeof params.limit === 'number') {
    search.set('limit', String(params.limit));
  }

  const payload = await apiFetch<unknown>(
    `/students/${params.studentId}/mastery-trend?${search.toString()}`,
  );

  return normalizeTrendResponse(payload);
}

export function getReadableErrorMessage(error: unknown, fallback: string): string {
  if (error instanceof Error) {
    return toErrorMessage(error.message, fallback);
  }

  return fallback;
}
