import type {
  AuthRole,
  AuthUser,
  AttemptDetail,
  AttemptListItem,
  AttemptStatus,
  CurriculumDetail,
  CurriculumListItem,
  CurriculumQuestionTag,
  CurriculumSkillDetail,
  CurriculumTopicDetail,
  CurriculumUnitDetail,
  MasteryOverview,
  MasterySkill,
  MasterySnapshotItem,
  MasteryTrendResponse,
  RiskLevel,
  Student,
  StudentProjection,
  TrendBucket,
  TrendDirection,
} from '../types/api';
import {
  clearSessionToken,
  getSessionToken,
  setSessionToken,
} from './authSession';

const API_URL = 'http://localhost:4000';

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

type UnauthorizedHandler = () => void;

type OverviewCacheEntry = {
  value: MasteryOverview;
  expiresAt: number;
};

type Paged<T> = {
  items: T[];
  nextCursor: string | null;
};

const OVERVIEW_CACHE_TTL_MS = 60_000;
const overviewCache = new Map<string, OverviewCacheEntry>();
const overviewInFlight = new Map<string, Promise<MasteryOverview>>();
const RISK_LEVELS = new Set<RiskLevel>(['LOW', 'MEDIUM', 'HIGH', 'UNKNOWN']);
const TREND_DIRECTIONS = new Set<TrendDirection>(['UP', 'DOWN', 'FLAT', 'INSUFFICIENT_DATA']);
const ATTEMPT_STATUS = new Set<AttemptStatus>(['IN_PROGRESS', 'SUBMITTED']);
const AUTH_ROLES = new Set<AuthRole>(['ADMIN', 'TEACHER', 'PARENT', 'STUDENT']);

let unauthorizedHandler: UnauthorizedHandler | null = null;
let isUnauthorizedHandled = false;

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

function parseAuthRole(value: unknown): AuthRole {
  if (typeof value !== 'string' || !AUTH_ROLES.has(value as AuthRole)) {
    throw new Error('Invalid auth role');
  }

  return value as AuthRole;
}

function parseAuthUser(payload: unknown): AuthUser {
  if (!isRecord(payload)) {
    throw new Error('Invalid session response');
  }

  return {
    id: requireString(payload.id, 'auth.id'),
    email: requireString(payload.email, 'auth.email'),
    role: parseAuthRole(payload.role),
    organizationId: requireString(payload.organizationId, 'auth.organizationId'),
  };
}

function requireString(value: unknown, fieldName: string): string {
  if (typeof value !== 'string' || value.length === 0) {
    throw new Error(`Invalid ${fieldName}`);
  }

  return value;
}

function requireNumber(value: unknown, fieldName: string): number {
  if (typeof value !== 'number' || Number.isNaN(value)) {
    throw new Error(`Invalid ${fieldName}`);
  }

  return value;
}

function optionalStringOrNull(value: unknown): string | null {
  if (typeof value === 'string') {
    return value;
  }

  if (value === null || value === undefined) {
    return null;
  }

  throw new Error('Invalid optional string field');
}

function optionalString(value: unknown): string | undefined {
  if (typeof value === 'string' && value.length > 0) {
    return value;
  }

  if (value === null || value === undefined) {
    return undefined;
  }

  throw new Error('Invalid optional string field');
}

function optionalNumber(value: unknown): number | undefined {
  if (typeof value === 'number' && !Number.isNaN(value)) {
    return value;
  }

  if (value === null || value === undefined) {
    return undefined;
  }

  throw new Error('Invalid optional number field');
}

function parseStatus(value: unknown): AttemptStatus {
  if (typeof value !== 'string' || !ATTEMPT_STATUS.has(value as AttemptStatus)) {
    throw new Error('Invalid attempt status');
  }

  return value as AttemptStatus;
}

function parseQuestionTag(payload: unknown): CurriculumQuestionTag {
  if (!isRecord(payload)) {
    throw new Error('Invalid curriculum question tag');
  }

  return {
    id: requireString(payload.id, 'questionTag.id'),
    questionId: requireString(payload.questionId, 'questionTag.questionId'),
  };
}

function parseCurriculumSkill(payload: unknown): CurriculumSkillDetail {
  if (!isRecord(payload)) {
    throw new Error('Invalid curriculum skill');
  }

  const rawQuestionTags = payload.questionTags;
  if (!Array.isArray(rawQuestionTags)) {
    throw new Error('Invalid curriculum skill questionTags');
  }

  return {
    id: requireString(payload.id, 'skill.id'),
    name: requireString(payload.name, 'skill.name'),
    questionTags: rawQuestionTags.map(parseQuestionTag),
  };
}

function parseCurriculumTopic(payload: unknown): CurriculumTopicDetail {
  if (!isRecord(payload)) {
    throw new Error('Invalid curriculum topic');
  }

  const rawSkills = payload.skills;
  if (!Array.isArray(rawSkills)) {
    throw new Error('Invalid curriculum topic skills');
  }

  return {
    id: requireString(payload.id, 'topic.id'),
    name: requireString(payload.name, 'topic.name'),
    order: requireNumber(payload.order, 'topic.order'),
    skills: rawSkills.map(parseCurriculumSkill),
  };
}

function parseCurriculumUnit(payload: unknown): CurriculumUnitDetail {
  if (!isRecord(payload)) {
    throw new Error('Invalid curriculum unit');
  }

  const rawTopics = payload.topics;
  if (!Array.isArray(rawTopics)) {
    throw new Error('Invalid curriculum unit topics');
  }

  return {
    id: requireString(payload.id, 'unit.id'),
    name: requireString(payload.name, 'unit.name'),
    order: requireNumber(payload.order, 'unit.order'),
    topics: rawTopics.map(parseCurriculumTopic),
  };
}

function parseCurriculumListItem(payload: unknown): CurriculumListItem {
  if (!isRecord(payload)) {
    throw new Error('Invalid curriculum item');
  }

  return {
    id: requireString(payload.id, 'curriculum.id'),
    name: requireString(payload.name, 'curriculum.name'),
    createdAt: requireString(payload.createdAt, 'curriculum.createdAt'),
    unitsCount: requireNumber(payload.unitsCount, 'curriculum.unitsCount'),
  };
}

function parseAttemptListItem(payload: unknown): AttemptListItem {
  if (!isRecord(payload)) {
    throw new Error('Invalid attempt list item');
  }

  return {
    attemptId: requireString(payload.attemptId, 'attempt.attemptId'),
    assignmentId: requireString(payload.assignmentId, 'attempt.assignmentId'),
    studentId: requireString(payload.studentId, 'attempt.studentId'),
    status: parseStatus(payload.status),
    startedAt: requireString(payload.startedAt, 'attempt.startedAt'),
    submittedAt: optionalStringOrNull(payload.submittedAt),
    totalScore: requireNumber(payload.totalScore, 'attempt.totalScore'),
  };
}

function parseAttemptDetail(payload: unknown): AttemptDetail {
  if (!isRecord(payload)) {
    throw new Error('Invalid attempt detail response');
  }

  const questionAttemptsRaw = Array.isArray(payload.questionAttempts) ? payload.questionAttempts : [];

  return {
    attemptId: requireString(payload.attemptId, 'attempt.attemptId'),
    assignmentId: optionalString(payload.assignmentId),
    studentId: optionalString(payload.studentId),
    status: payload.status === undefined ? undefined : parseStatus(payload.status),
    createdAt: optionalString(payload.createdAt),
    submittedAt: optionalStringOrNull(payload.submittedAt),
    totalScore: optionalNumber(payload.totalScore),
    questionAttempts: questionAttemptsRaw.map((item) => {
      if (!isRecord(item)) {
        throw new Error('Invalid question attempt item');
      }

      return {
        questionId: optionalString(item.questionId),
        score:
          item.score === undefined
            ? undefined
            : item.score === null
              ? null
              : requireNumber(item.score, 'questionAttempt.score'),
        feedback:
          item.feedback === null || item.feedback === undefined
            ? null
            : requireString(item.feedback, 'questionAttempt.feedback'),
      };
    }),
  };
}

function parseSnapshotItem(payload: unknown): MasterySnapshotItem {
  if (!isRecord(payload)) {
    throw new Error('Invalid mastery snapshot item');
  }

  const riskLevel = parseRiskLevel(payload.riskLevel) ?? 'UNKNOWN';

  return {
    id: requireString(payload.id, 'snapshot.id'),
    createdAt: requireString(payload.createdAt, 'snapshot.createdAt'),
    averageMastery: requireNumber(payload.averageMastery, 'snapshot.averageMastery'),
    skillsTracked: requireNumber(payload.skillsTracked, 'snapshot.skillsTracked'),
    riskLevel,
  };
}

function parseStudentProjection(payload: unknown): StudentProjection {
  if (!isRecord(payload)) {
    throw new Error('Invalid student projection response');
  }

  return {
    studentId: requireString(payload.studentId, 'projection.studentId'),
    skillsTracked: requireNumber(payload.skillsTracked, 'projection.skillsTracked'),
    averageMastery: requireNumber(payload.averageMastery, 'projection.averageMastery'),
    riskLevel: parseRiskLevel(payload.riskLevel) ?? 'UNKNOWN',
    highRiskSkills: requireNumber(payload.highRiskSkills, 'projection.highRiskSkills'),
    mediumRiskSkills: requireNumber(payload.mediumRiskSkills, 'projection.mediumRiskSkills'),
    lowRiskSkills: requireNumber(payload.lowRiskSkills, 'projection.lowRiskSkills'),
  };
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

function normalizePagedItems<T>(
  payload: unknown,
  options: {
    errorLabel: string;
    listKey: string;
    parseItem: (value: unknown) => T;
  },
): Paged<T> {
  if (!isRecord(payload)) {
    throw new Error(`Invalid ${options.errorLabel} response`);
  }

  let rawItems: unknown;
  let rawNextCursor: unknown = null;

  if (Array.isArray(payload.items)) {
    rawItems = payload.items;
    rawNextCursor = payload.nextCursor;
  } else if (Array.isArray(payload[options.listKey])) {
    rawItems = payload[options.listKey];
    if (isRecord(payload.page)) {
      rawNextCursor = payload.page.nextCursor;
    } else {
      rawNextCursor = payload.nextCursor;
    }
  } else {
    throw new Error(`Invalid ${options.errorLabel} response: expected item array`);
  }

  if (!Array.isArray(rawItems)) {
    throw new Error(`Invalid ${options.errorLabel} response: expected item array`);
  }

  const items = rawItems.map(options.parseItem);
  const nextCursor = typeof rawNextCursor === 'string' ? rawNextCursor : null;

  return { items, nextCursor };
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

  if (isUnauthorizedHandled) {
    return;
  }

  isUnauthorizedHandled = true;

  logout();

  if (unauthorizedHandler) {
    unauthorizedHandler();
    return;
  }

  if (window.location.pathname !== '/login') {
    window.location.replace('/login');
  }
}

function markUnauthorizedCycleResolved(): void {
  if (typeof window === 'undefined') {
    return;
  }

  window.setTimeout(() => {
    isUnauthorizedHandled = false;
  }, 0);
}

export function setUnauthorizedHandler(handler: UnauthorizedHandler | null): () => void {
  unauthorizedHandler = handler;

  return () => {
    if (unauthorizedHandler === handler) {
      unauthorizedHandler = null;
    }
  };
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
  return getSessionToken();
}

export function setToken(token: string): void {
  setSessionToken(token);
}

export function logout(): void {
  clearSessionToken();
}

export async function getSessionUser(options: { signal?: AbortSignal } = {}): Promise<AuthUser> {
  const payload = await apiFetch<unknown>('/me', { signal: options.signal });
  return parseAuthUser(payload);
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
      markUnauthorizedCycleResolved();
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

export async function listCurriculum(
  options: { cursor?: string; limit?: number; signal?: AbortSignal } = {},
): Promise<Paged<CurriculumListItem>> {
  const query = new URLSearchParams();

  if (options.cursor) {
    query.set('cursor', options.cursor);
  }

  if (typeof options.limit === 'number') {
    query.set('limit', String(options.limit));
  }

  const suffix = query.toString();
  const path = suffix.length > 0 ? `/curriculum?${suffix}` : '/curriculum';
  const payload = await apiFetch<unknown>(path, { signal: options.signal });

  return normalizePagedItems(payload, {
    errorLabel: 'curriculum list',
    listKey: 'items',
    parseItem: parseCurriculumListItem,
  });
}

export async function getCurriculumById(
  id: string,
  options: { signal?: AbortSignal } = {},
): Promise<CurriculumDetail> {
  const payload = await apiFetch<unknown>(`/curriculum/${id}`, { signal: options.signal });
  if (!isRecord(payload)) {
    throw new Error('Invalid curriculum detail response');
  }

  const unitsRaw = payload.units;
  if (!Array.isArray(unitsRaw)) {
    throw new Error('Invalid curriculum detail response: units');
  }

  return {
    id: requireString(payload.id, 'curriculum.id'),
    name: requireString(payload.name, 'curriculum.name'),
    createdAt: requireString(payload.createdAt, 'curriculum.createdAt'),
    units: unitsRaw.map(parseCurriculumUnit),
  };
}

export async function listAttempts(
  options: {
    cursor?: string;
    limit?: number;
    studentId?: string;
    assignmentId?: string;
    signal?: AbortSignal;
  } = {},
): Promise<Paged<AttemptListItem>> {
  const query = new URLSearchParams();

  if (options.cursor) {
    query.set('cursor', options.cursor);
  }

  if (typeof options.limit === 'number') {
    query.set('limit', String(options.limit));
  }

  if (options.studentId) {
    query.set('studentId', options.studentId);
  }

  if (options.assignmentId) {
    query.set('assignmentId', options.assignmentId);
  }

  const suffix = query.toString();
  const path = suffix.length > 0 ? `/attempts?${suffix}` : '/attempts';
  const payload = await apiFetch<unknown>(path, { signal: options.signal });

  return normalizePagedItems(payload, {
    errorLabel: 'attempts list',
    listKey: 'attempts',
    parseItem: parseAttemptListItem,
  });
}

export async function getAttemptById(
  id: string,
  options: { signal?: AbortSignal } = {},
): Promise<AttemptDetail> {
  const payload = await apiFetch<unknown>(`/attempts/${id}`, { signal: options.signal });
  return parseAttemptDetail(payload);
}

export async function listMasterySnapshots(
  studentId: string,
  options: { cursor?: string; limit?: number; signal?: AbortSignal } = {},
): Promise<Paged<MasterySnapshotItem>> {
  const query = new URLSearchParams();

  if (options.cursor) {
    query.set('cursor', options.cursor);
  }

  if (typeof options.limit === 'number') {
    query.set('limit', String(options.limit));
  }

  const suffix = query.toString();
  const path =
    suffix.length > 0
      ? `/students/${studentId}/mastery-snapshots?${suffix}`
      : `/students/${studentId}/mastery-snapshots`;

  const payload = await apiFetch<unknown>(path, { signal: options.signal });

  return normalizePagedItems(payload, {
    errorLabel: 'mastery snapshots list',
    listKey: 'snapshots',
    parseItem: parseSnapshotItem,
  });
}

export async function getStudentProjection(
  studentId: string,
  options: { signal?: AbortSignal } = {},
): Promise<StudentProjection> {
  const payload = await apiFetch<unknown>(`/students/${studentId}/projection`, {
    signal: options.signal,
  });

  return parseStudentProjection(payload);
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
