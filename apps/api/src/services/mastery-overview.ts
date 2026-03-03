import type { Prisma } from '@prisma/client';

import { prisma } from '../lib/prisma.js';

export type MasteryOverviewSnapshot = {
  curriculumSkillId: string;
  masteryLevel: number;
  createdAt: Date;
};

export type MasteryOverviewSnapshotPage = {
  snapshots: MasteryOverviewSnapshot[];
  nextCursor: string | null;
};

type ParsedMasteryCursor = {
  createdAt: Date;
  id: string | null;
};

function parseMasteryCursor(cursor: string): ParsedMasteryCursor | null {
  const separatorIndex = cursor.indexOf('|');

  if (separatorIndex === -1) {
    const createdAt = new Date(cursor);
    if (Number.isNaN(createdAt.getTime())) {
      return null;
    }

    return {
      createdAt,
      id: null,
    };
  }

  if (
    separatorIndex === 0 ||
    separatorIndex === cursor.length - 1 ||
    cursor.indexOf('|', separatorIndex + 1) !== -1
  ) {
    return null;
  }

  const createdAtValue = cursor.slice(0, separatorIndex);
  const cursorId = cursor.slice(separatorIndex + 1);
  const createdAt = new Date(createdAtValue);

  if (Number.isNaN(createdAt.getTime()) || cursorId.length === 0) {
    return null;
  }

  return {
    createdAt,
    id: cursorId,
  };
}

export function isValidMasteryOverviewCursor(cursor: string): boolean {
  return parseMasteryCursor(cursor) !== null;
}

export async function loadStudentSnapshotsWithCap(
  studentId: string,
  organizationId: string,
  cap = 2000,
): Promise<MasteryOverviewSnapshot[]> {
  const where = {
    studentId,
    organizationId,
  };

  const select = {
    curriculumSkillId: true,
    masteryLevel: true,
    createdAt: true,
  } as const;

  const snapshotCount = await prisma.masterySnapshot.count({ where });

  if (snapshotCount > cap) {
    const snapshots = await prisma.masterySnapshot.findMany({
      where,
      orderBy: {
        createdAt: 'desc',
      },
      take: cap,
      select,
    });

    return snapshots.reverse();
  }

  return prisma.masterySnapshot.findMany({
    where,
    orderBy: {
      createdAt: 'asc',
    },
    select,
  });
}

export async function loadStudentSnapshotsPage(
  studentId: string,
  organizationId: string,
  cursor?: string,
  limit = 200,
): Promise<MasteryOverviewSnapshotPage> {
  const parsedCursor = cursor ? parseMasteryCursor(cursor) : null;
  if (cursor && !parsedCursor) {
    throw new Error('INVALID_CURSOR');
  }

  let where: Prisma.MasterySnapshotWhereInput = {
    studentId,
    organizationId,
  };

  if (parsedCursor) {
    if (parsedCursor.id) {
      where = {
        studentId,
        organizationId,
        OR: [
          {
            createdAt: {
              lt: parsedCursor.createdAt,
            },
          },
          {
            createdAt: parsedCursor.createdAt,
            id: {
              lt: parsedCursor.id,
            },
          },
        ],
      };
    } else {
      where = {
        studentId,
        organizationId,
        createdAt: {
          lt: parsedCursor.createdAt,
        },
      };
    }
  }

  const snapshotsDesc = await prisma.masterySnapshot.findMany({
    where,
    orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    take: limit,
    select: {
      id: true,
      curriculumSkillId: true,
      masteryLevel: true,
      createdAt: true,
    },
  });

  const nextCursor =
    snapshotsDesc.length === limit
      ? (() => {
          const last = snapshotsDesc[snapshotsDesc.length - 1];
          if (!last) {
            return null;
          }

          return `${last.createdAt.toISOString()}|${last.id}`;
        })()
      : null;

  return {
    snapshots: snapshotsDesc
      .map((snapshot) => ({
        curriculumSkillId: snapshot.curriculumSkillId,
        masteryLevel: snapshot.masteryLevel,
        createdAt: snapshot.createdAt,
      }))
      .reverse(),
    nextCursor,
  };
}
