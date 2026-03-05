import type {
  MasteryOverview,
  MasterySkill,
  RiskLevel,
  MasteryTrendResponse,
  Student,
  TrendDirection,
  TrendBucket,
} from '../types/api';

const API_URL = 'http://localhost:4000';
const TOKEN_STORAGE_KEY = 'jwt';

export class ApiUnauthorizedError extends Error {
  readonly status = 401;

  constructor(message = 'Unauthorized') {
    super(message);
    this.name = 'ApiUnauthorizedError';
  }
}

type ApiFetchOptions = RequestInit & {
  auth?: boolean;
};

type StudentLike = {
  id: string;
};

type OverviewSkillLike = {
  skillId?: string;
  currentMastery: number;
  risk?: RiskLevel;
  trend?: TrendDirection;
};

type LoginResponse = {
  token: string;
};

type OverviewCacheEntry = {
  value: MasteryOverview;
  expiresAt: number;
};

const OVERVIEW_CACHE_TTL_MS = 60_000;
const overviewCache = new Map<string, OverviewCacheEntry>();
const overviewInFlight = new Map<string, Promise<MasteryOverview>>();
const RISK_LEVELS = new Set<RiskLevel>(['LOW', 'MEDIUM', 'HIGH', 'UNKNOWN']);
const TREND_DIRECTIONS = new Set<TrendDirection>(['UP', 'DOWN', 'FLAT', 'INSUFFICIENT_DATA']);

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

function parseRiskLevel(value: unknown): RiskLevel | undefined {
  if (typeof value !== 'string') {
    return undefined;
  }

  const normalized = value.toUpperCase();
  return RISK_LEVELS.has(normalized as RiskLevel) ? (normalized as RiskLevel) : undefined;
}

function parseTrendDirection(value: unknown): TrendDirection | undefined {
  if (typeof value !== 'string') {
    return undefined;
  }

  const normalized = value.toUpperCase();
  return TREND_DIRECTIONS.has(normalized as TrendDirection)
    ? (normalized as TrendDirection)
    : undefined;
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

function normalizeOverviewSkills(raw: unknown): MasterySkill[] {
  if (!Array.isArray(raw)) {
    return [];
  }

  const skills: MasterySkill[] = [];

  for (const item of raw) {
    if (!isRecord(item) || typeof item.currentMastery !== 'number') {
      continue;
    }

    const parsedSkill: OverviewSkillLike = {
      currentMastery: item.currentMastery,
      skillId: typeof item.skillId === 'string' ? item.skillId : undefined,
      risk: parseRiskLevel(item.risk),
      trend: parseTrendDirection(item.trend),
    };

    skills.push(parsedSkill);
  }

  return skills;
}

function normalizeOverview(payload: unknown): MasteryOverview {
  if (!isRecord(payload)) {
    throw new Error('Invalid mastery overview response');
  }

  const averageMastery = payload.averageMastery;
  const skillsTracked = payload.skillsTracked;
  const riskLevel = payload.riskLevel;

  if (typeof averageMastery === 'number' && typeof skillsTracked === 'number') {
    return {
      averageMastery,
      skillsTracked,
      riskLevel: parseRiskLevel(riskLevel),
      skills: normalizeOverviewSkills(payload.skills),
    };
  }

  const skills = normalizeOverviewSkills(payload.skills);
  if (skills.length === 0) {
    throw new Error('Invalid mastery overview response');
  }

  const masterySum = skills.reduce((sum, item) => sum + item.currentMastery, 0);
  const average = masterySum / skills.length;

  const priority = new Map<string, number>([
    ['HIGH', 3],
    ['MEDIUM', 2],
    ['LOW', 1],
  ]);

  let currentRisk: RiskLevel | undefined;
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
    skills,
  };
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
    throw new ApiUnauthorizedError('Authentication token is missing. Please login again.');
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

function handleUnauthorized(): void {
  if (typeof window === 'undefined') {
    return;
  }

  logout();

  if (window.location.pathname !== '/login') {
    window.location.replace('/login');
  }
}

function getCachedOverview(studentId: string): MasteryOverview | undefined {
  const cacheEntry = overviewCache.get(studentId);
  if (!cacheEntry) {
    return undefined;
  }

  if (cacheEntry.expiresAt <= Date.now()) {
    overviewCache.delete(studentId);
    return undefined;
  }

  return cacheEntry.value;
}

function setCachedOverview(studentId: string, value: MasteryOverview): void {
  overviewCache.set(studentId, {
    value,
    expiresAt: Date.now() + OVERVIEW_CACHE_TTL_MS,
  });
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
    if (auth && response.status === 401) {
      handleUnauthorized();
      throw new ApiUnauthorizedError('Session expired. Please login again.');
    }

    throw new Error(parseApiError(payload, response.status));
  }

  return payload as T;
}

export async function login(email: string, password: string): Promise<string> {
  const payload = await apiFetch<LoginResponse>('/auth/login', {
    method: 'POST',
    auth: false,
    body: JSON.stringify({ email, password }),
  });

  if (typeof payload.token === 'string' && payload.token.length > 0) {
    return payload.token;
  }

  throw new Error('Invalid login response: token is missing');
}

export async function listStudents(options: { signal?: AbortSignal } = {}): Promise<Student[]> {
  const payload = await apiFetch<unknown>('/students', { signal: options.signal });
  return normalizeStudents(payload);
}

export async function getStudentMasteryOverview(
  studentId: string,
  options: { signal?: AbortSignal } = {},
): Promise<MasteryOverview> {
  const { signal } = options;

  const cachedOverview = getCachedOverview(studentId);
  if (cachedOverview) {
    return cachedOverview;
  }

  if (!signal) {
    const inFlightRequest = overviewInFlight.get(studentId);
    if (inFlightRequest) {
      return inFlightRequest;
    }
  }

  const request = (async () => {
    const payload = await apiFetch<unknown>(`/students/${studentId}/mastery-overview`, {
      signal,
    });

    const overview = normalizeOverview(payload);
    if (!signal?.aborted) {
      setCachedOverview(studentId, overview);
    }

    return overview;
  })();

  if (!signal) {
    overviewInFlight.set(studentId, request);
    try {
      return await request;
    } finally {
      overviewInFlight.delete(studentId);
    }
  }

  return request;
}

export async function getStudentMasteryTrend(
  params: {
    studentId: string;
    bucket?: 'day' | 'week' | 'month';
    cursor?: string;
    limit?: number;
  },
  options: { signal?: AbortSignal } = {},
): Promise<MasteryTrendResponse> {
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
    { signal: options.signal },
  );

  return normalizeTrendResponse(payload);
}

export function isAbortError(error: unknown): boolean {
  return error instanceof DOMException && error.name === 'AbortError';
}

export function isUnauthorizedError(error: unknown): error is ApiUnauthorizedError {
  return error instanceof ApiUnauthorizedError;
}

export function getReadableErrorMessage(error: unknown, fallback: string): string {
  if (isUnauthorizedError(error)) {
    return 'Session expired. Please login again.';
  }

  if (error instanceof Error) {
    return toErrorMessage(error.message, fallback);
  }

  return fallback;
}
