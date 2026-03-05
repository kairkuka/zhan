import type { Prisma } from '@prisma/client';
import { prisma } from '../lib/prisma.js';

export type MasteryTrendBucket = 'day' | 'week' | 'month';
export const HARD_CAP = 10000;

export type MasteryTrendSnapshot = {
  curriculumSkillId: string;
  masteryLevel: number;
  createdAt: Date;
};

export type MasteryTrendBucketPoint = {
  date: string;
  averageMastery: number;
  skillsTracked: number;
};

export type MasteryTrendSnapshotPage = {
  snapshots: MasteryTrendSnapshot[];
  nextCursor: string | null;
};

type ParsedCursor = {
  createdAt: Date;
  id?: string;
};

type AggregateState = {
  sum: number;
  count: number;
  skills: Set<string>;
};

function formatDateUTC(date: Date): string {
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, '0');
  const day = String(date.getUTCDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function getWeekStartUTC(date: Date): Date {
  const start = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  const dayOfWeek = start.getUTCDay();
  const offsetToMonday = (dayOfWeek + 6) % 7;
  start.setUTCDate(start.getUTCDate() - offsetToMonday);
  return start;
}

function getBucketDate(snapshotDate: Date, bucket: MasteryTrendBucket): string {
  if (bucket === 'day') {
    return formatDateUTC(snapshotDate);
  }

  if (bucket === 'week') {
    return formatDateUTC(getWeekStartUTC(snapshotDate));
  }

  const monthStart = new Date(Date.UTC(snapshotDate.getUTCFullYear(), snapshotDate.getUTCMonth(), 1));
  return formatDateUTC(monthStart);
}

function parseCursor(cursor: string): ParsedCursor | null {
  const separatorIndex = cursor.indexOf('|');

  if (separatorIndex === -1) {
    const createdAt = new Date(cursor);
    if (Number.isNaN(createdAt.getTime())) {
      return null;
    }

    return { createdAt };
  }

  if (
    separatorIndex === 0 ||
    separatorIndex === cursor.length - 1 ||
    cursor.indexOf('|', separatorIndex + 1) !== -1
  ) {
    return null;
  }

  const createdAtValue = cursor.slice(0, separatorIndex);
  const id = cursor.slice(separatorIndex + 1);
  const createdAt = new Date(createdAtValue);

  if (Number.isNaN(createdAt.getTime()) || id.length === 0) {
    return null;
  }

  return {
    createdAt,
    id,
  };
}

function formatCursor(createdAt: Date, id: string): string {
  return `${createdAt.toISOString()}|${id}`;
}

export function isValidMasteryTrendCursor(cursor: string): boolean {
  return parseCursor(cursor) !== null;
}

export async function loadMasteryTrendSnapshotsPage(params: {
  studentId: string;
  organizationId: string;
  from?: Date;
  to?: Date;
  cursor?: string;
  limit?: number;
}): Promise<MasteryTrendSnapshotPage> {
  const parsedCursor = params.cursor ? parseCursor(params.cursor) : null;
  if (params.cursor && !parsedCursor) {
    throw new Error('INVALID_CURSOR');
  }

  const rangeFilter: Prisma.DateTimeFilter = {};
  if (params.from) {
    rangeFilter.gte = params.from;
  }
  if (params.to) {
    rangeFilter.lte = params.to;
  }

  const where: Prisma.MasterySnapshotWhereInput = {
    studentId: params.studentId,
    organizationId: params.organizationId,
    ...(params.from || params.to ? { createdAt: rangeFilter } : {}),
  };

  if (parsedCursor?.id) {
    where.OR = [
      {
        createdAt: { gt: parsedCursor.createdAt },
      },
      {
        createdAt: parsedCursor.createdAt,
        id: { gt: parsedCursor.id },
      },
    ];
  } else if (parsedCursor) {
    where.createdAt = {
      ...(where.createdAt as Prisma.DateTimeFilter | undefined),
      gt: parsedCursor.createdAt,
    };
  }

  const limit = params.limit ?? 200;
  const totalCount = await prisma.masterySnapshot.count({ where });
  if (totalCount === 0) {
    return {
      snapshots: [],
      nextCursor: null,
    };
  }

  const select = {
    id: true,
    curriculumSkillId: true,
    masteryLevel: true,
    createdAt: true,
  } as const;

  if (totalCount > HARD_CAP) {
    const cappedDesc = await prisma.masterySnapshot.findMany({
      where,
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: HARD_CAP,
      select,
    });

    const cappedAsc = cappedDesc.reverse();
    const page = cappedAsc.slice(0, limit);
    const nextCursor =
      cappedAsc.length > limit
        ? (() => {
            const last = page[page.length - 1];
            return last ? formatCursor(last.createdAt, last.id) : null;
          })()
        : null;

    return {
      snapshots: page.map((snapshot) => ({
        curriculumSkillId: snapshot.curriculumSkillId,
        masteryLevel: snapshot.masteryLevel,
        createdAt: snapshot.createdAt,
      })),
      nextCursor,
    };
  }

  const snapshots = await prisma.masterySnapshot.findMany({
    where,
    orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
    take: limit + 1,
    select,
  });

  const hasMore = snapshots.length > limit;
  const page = hasMore ? snapshots.slice(0, limit) : snapshots;
  const nextCursor =
    hasMore && page.length > 0
      ? (() => {
          const last = page[page.length - 1];
          return last ? formatCursor(last.createdAt, last.id) : null;
        })()
      : null;

  return {
    snapshots: page.map((snapshot) => ({
      curriculumSkillId: snapshot.curriculumSkillId,
      masteryLevel: snapshot.masteryLevel,
      createdAt: snapshot.createdAt,
    })),
    nextCursor,
  };
}

export function aggregateMasteryTrend(
  snapshots: MasteryTrendSnapshot[],
  bucket: MasteryTrendBucket,
): MasteryTrendBucketPoint[] {
  if (snapshots.length === 0) {
    return [];
  }

  const buckets = new Map<string, AggregateState>();

  for (const snapshot of snapshots) {
    const bucketDate = getBucketDate(snapshot.createdAt, bucket);
    const state = buckets.get(bucketDate) ?? {
      sum: 0,
      count: 0,
      skills: new Set<string>(),
    };

    state.sum += snapshot.masteryLevel;
    state.count += 1;
    state.skills.add(snapshot.curriculumSkillId);

    buckets.set(bucketDate, state);
  }

  return Array.from(buckets.entries())
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([date, state]) => ({
      date,
      averageMastery: state.count === 0 ? 0 : state.sum / state.count,
      skillsTracked: state.skills.size,
    }));
}
