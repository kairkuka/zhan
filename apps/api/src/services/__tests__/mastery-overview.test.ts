import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { prisma } from '../../lib/prisma.js';
import { loadStudentSnapshotsPage, loadStudentSnapshotsWithCap } from '../mastery-overview.js';
import type { MasteryOverviewSnapshot } from '../mastery-overview.js';

type CountArgs = Parameters<typeof prisma.masterySnapshot.count>[0];
type FindManyArgs = Parameters<typeof prisma.masterySnapshot.findMany>[0];
type SnapshotItem = MasteryOverviewSnapshot;

function mockMasterySnapshotDelegate(options: {
  countResult: number;
  findManyResult: SnapshotItem[];
}) {
  const originalCount = prisma.masterySnapshot.count;
  const originalFindMany = prisma.masterySnapshot.findMany;

  const countCalls: CountArgs[] = [];
  const findManyCalls: FindManyArgs[] = [];

  (prisma.masterySnapshot as { count: (args: CountArgs) => Promise<number> }).count = async (
    args: CountArgs,
  ) => {
    countCalls.push(args);
    return options.countResult;
  };

  (prisma.masterySnapshot as { findMany: (args: FindManyArgs) => Promise<SnapshotItem[]> }).findMany = async (
    args: FindManyArgs,
  ) => {
    findManyCalls.push(args);
    return [...options.findManyResult];
  };

  return {
    countCalls,
    findManyCalls,
    restore() {
      prisma.masterySnapshot.count = originalCount;
      prisma.masterySnapshot.findMany = originalFindMany;
    },
  };
}

describe('loadStudentSnapshotsWithCap', () => {
  const studentId = 'student_test_id';
  const organizationId = 'org_test_id';

  it('returns ascending snapshots as-is when count <= cap', async () => {
    const snapshots = [
      {
        curriculumSkillId: 'skill_1',
        masteryLevel: 0.2,
        createdAt: new Date('2026-01-01T00:00:00.000Z'),
      },
      {
        curriculumSkillId: 'skill_1',
        masteryLevel: 0.4,
        createdAt: new Date('2026-01-02T00:00:00.000Z'),
      },
      {
        curriculumSkillId: 'skill_2',
        masteryLevel: 0.6,
        createdAt: new Date('2026-01-03T00:00:00.000Z'),
      },
    ];

    const mocked = mockMasterySnapshotDelegate({
      countResult: 3,
      findManyResult: snapshots,
    });

    try {
      const result = await loadStudentSnapshotsWithCap(studentId, organizationId, 2000);

      assert.equal(mocked.countCalls.length, 1);
      assert.deepEqual(mocked.countCalls[0], {
        where: {
          studentId,
          organizationId,
        },
      });

      assert.equal(mocked.findManyCalls.length, 1);
      const findManyArgs = mocked.findManyCalls[0];
      assert.ok(findManyArgs);
      assert.deepEqual(findManyArgs.where, {
        studentId,
        organizationId,
      });
      assert.deepEqual(findManyArgs.orderBy, { createdAt: 'asc' });
      assert.equal(findManyArgs.take, undefined);

      assert.deepEqual(result, snapshots);
    } finally {
      mocked.restore();
    }
  });

  it('loads last cap snapshots in desc order and returns reversed when count > cap', async () => {
    const cap = 2000;
    const descSnapshots = [
      {
        curriculumSkillId: 'skill_1',
        masteryLevel: 0.9,
        createdAt: new Date('2026-01-03T00:00:00.000Z'),
      },
      {
        curriculumSkillId: 'skill_1',
        masteryLevel: 0.7,
        createdAt: new Date('2026-01-02T00:00:00.000Z'),
      },
      {
        curriculumSkillId: 'skill_1',
        masteryLevel: 0.5,
        createdAt: new Date('2026-01-01T00:00:00.000Z'),
      },
    ];

    const expectedChronological = [descSnapshots[2], descSnapshots[1], descSnapshots[0]];

    const mocked = mockMasterySnapshotDelegate({
      countResult: 5000,
      findManyResult: descSnapshots,
    });

    try {
      const result = await loadStudentSnapshotsWithCap(studentId, organizationId, cap);

      assert.equal(mocked.countCalls.length, 1);
      assert.equal(mocked.findManyCalls.length, 1);

      const findManyArgs = mocked.findManyCalls[0];
      assert.ok(findManyArgs);
      assert.deepEqual(findManyArgs.where, {
        studentId,
        organizationId,
      });
      assert.deepEqual(findManyArgs.orderBy, { createdAt: 'desc' });
      assert.equal(findManyArgs.take, cap);

      assert.deepEqual(result, expectedChronological);
    } finally {
      mocked.restore();
    }
  });
});

describe('loadStudentSnapshotsPage', () => {
  const studentId = 'student_page_test_id';
  const organizationId = 'org_page_test_id';

  it('loads first page in desc order and returns chronological snapshots', async () => {
    const limit = 2;
    const descSnapshots = [
      {
        curriculumSkillId: 'skill_1',
        masteryLevel: 0.8,
        createdAt: new Date('2026-01-03T00:00:00.000Z'),
      },
      {
        curriculumSkillId: 'skill_1',
        masteryLevel: 0.6,
        createdAt: new Date('2026-01-02T00:00:00.000Z'),
      },
    ];

    const mocked = mockMasterySnapshotDelegate({
      countResult: 0,
      findManyResult: descSnapshots,
    });

    try {
      const result = await loadStudentSnapshotsPage(studentId, organizationId, undefined, limit);

      assert.equal(mocked.countCalls.length, 0);
      assert.equal(mocked.findManyCalls.length, 1);

      const findManyArgs = mocked.findManyCalls[0];
      assert.ok(findManyArgs);
      assert.deepEqual(findManyArgs.where, {
        studentId,
        organizationId,
      });
      assert.deepEqual(findManyArgs.orderBy, { createdAt: 'desc' });
      assert.equal(findManyArgs.take, limit);

      assert.deepEqual(result.snapshots, [descSnapshots[1], descSnapshots[0]]);
      assert.equal(result.nextCursor, '2026-01-02T00:00:00.000Z');
    } finally {
      mocked.restore();
    }
  });

  it('loads second page with cursor filter and returns chronological snapshots', async () => {
    const limit = 2;
    const cursor = new Date('2026-01-02T00:00:00.000Z');
    const descSnapshots = [
      {
        curriculumSkillId: 'skill_1',
        masteryLevel: 0.4,
        createdAt: new Date('2026-01-01T00:00:00.000Z'),
      },
    ];

    const mocked = mockMasterySnapshotDelegate({
      countResult: 0,
      findManyResult: descSnapshots,
    });

    try {
      const result = await loadStudentSnapshotsPage(studentId, organizationId, cursor, limit);

      assert.equal(mocked.countCalls.length, 0);
      assert.equal(mocked.findManyCalls.length, 1);

      const findManyArgs = mocked.findManyCalls[0];
      assert.ok(findManyArgs);
      assert.deepEqual(findManyArgs.where, {
        studentId,
        organizationId,
        createdAt: {
          lt: cursor,
        },
      });
      assert.deepEqual(findManyArgs.orderBy, { createdAt: 'desc' });
      assert.equal(findManyArgs.take, limit);

      assert.deepEqual(result.snapshots, descSnapshots);
      assert.equal(result.nextCursor, null);
    } finally {
      mocked.restore();
    }
  });
});
