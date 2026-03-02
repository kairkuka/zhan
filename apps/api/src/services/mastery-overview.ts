import { prisma } from '../lib/prisma.js';

export type MasteryOverviewSnapshot = {
  curriculumSkillId: string;
  masteryLevel: number;
  createdAt: Date;
};

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
