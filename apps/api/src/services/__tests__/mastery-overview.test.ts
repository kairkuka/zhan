import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { prisma } from '../../lib/prisma.js';
import { loadStudentSnapshotsPage, loadStudentSnapshotsWithCap } from '../mastery-overview.js';

type CountArgs = Parameters<typeof prisma.masterySnapshot.count>[0];
type FindManyArgs = Parameters<typeof prisma.masterySnapshot.findMany>[0];
type FindManyResult = Awaited<ReturnType<typeof prisma.masterySnapshot.findMany>>;

type MockOptions = {
  countResult?: number;
  findManyResponder: (args: FindManyArgs, callIndex: number) => Promise<unknown[]> | unknown[];
};

function mockMasterySnapshotDelegate(options: MockOptions) {
  const originalCount = prisma.masterySnapshot.count;
  const originalFindMany = prisma.masterySnapshot.findMany;

  const countCalls: CountArgs[] = [];
  const findManyCalls: FindManyArgs[] = [];
  let findManyCallIndex = 0;

  (prisma.masterySnapshot as { count: (args: CountArgs) => Promise<number> }).count = async (
    args: CountArgs,
  ) => {
    countCalls.push(args);
    return options.countResult ?? 0;
  };

  (
    prisma.masterySnapshot as {
      findMany: (args: FindManyArgs) => Promise<FindManyResult>;
    }
  ).findMany = async (args: FindManyArgs) => {
    findManyCalls.push(args);
    const result = await options.findManyResponder(args, findManyCallIndex++);
    return result as FindManyResult;
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
      findManyResponder: async () => snapshots,
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

    const mocked = mockMasterySnapshotDelegate({
      countResult: 5000,
      findManyResponder: async () => [...descSnapshots],
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

      assert.deepEqual(result, [descSnapshots[2], descSnapshots[1], descSnapshots[0]]);
    } finally {
      mocked.restore();
    }
  });
});

describe('loadStudentSnapshotsPage', () => {
  const studentId = 'student_page_test_id';
  const organizationId = 'org_page_test_id';

  it('loads first page in deterministic desc order and returns chronological snapshots', async () => {
    const limit = 2;
    const descSnapshots = [
      {
        id: 'ckc',
        curriculumSkillId: 'skill_1',
        masteryLevel: 0.8,
        createdAt: new Date('2026-01-03T00:00:00.000Z'),
      },
      {
        id: 'ckb',
        curriculumSkillId: 'skill_1',
        masteryLevel: 0.6,
        createdAt: new Date('2026-01-02T00:00:00.000Z'),
      },
    ];

    const mocked = mockMasterySnapshotDelegate({
      findManyResponder: async () => descSnapshots,
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
      assert.deepEqual(findManyArgs.orderBy, [{ createdAt: 'desc' }, { id: 'desc' }]);
      assert.equal(findManyArgs.take, limit);

      assert.deepEqual(result.snapshots, [
        {
          curriculumSkillId: 'skill_1',
          masteryLevel: 0.6,
          createdAt: new Date('2026-01-02T00:00:00.000Z'),
        },
        {
          curriculumSkillId: 'skill_1',
          masteryLevel: 0.8,
          createdAt: new Date('2026-01-03T00:00:00.000Z'),
        },
      ]);
      assert.equal(result.nextCursor, '2026-01-02T00:00:00.000Z|ckb');
    } finally {
      mocked.restore();
    }
  });

  it('supports old cursor format (createdAt only) for backward compatibility', async () => {
    const limit = 2;
    const cursor = '2026-01-02T00:00:00.000Z';
    const descSnapshots = [
      {
        id: 'cka',
        curriculumSkillId: 'skill_1',
        masteryLevel: 0.4,
        createdAt: new Date('2026-01-01T00:00:00.000Z'),
      },
    ];

    const mocked = mockMasterySnapshotDelegate({
      findManyResponder: async () => descSnapshots,
    });

    try {
      const result = await loadStudentSnapshotsPage(studentId, organizationId, cursor, limit);

      assert.equal(mocked.findManyCalls.length, 1);
      const findManyArgs = mocked.findManyCalls[0];
      assert.ok(findManyArgs);
      assert.deepEqual(findManyArgs.where, {
        studentId,
        organizationId,
        createdAt: {
          lt: new Date('2026-01-02T00:00:00.000Z'),
        },
      });
      assert.deepEqual(findManyArgs.orderBy, [{ createdAt: 'desc' }, { id: 'desc' }]);
      assert.equal(findManyArgs.take, limit);

      assert.deepEqual(result.snapshots, [
        {
          curriculumSkillId: 'skill_1',
          masteryLevel: 0.4,
          createdAt: new Date('2026-01-01T00:00:00.000Z'),
        },
      ]);
      assert.equal(result.nextCursor, null);
    } finally {
      mocked.restore();
    }
  });

  it('handles identical timestamps without duplicates or gaps using deterministic cursor', async () => {
    const limit = 2;
    const sharedCreatedAt = new Date('2026-01-03T00:00:00.000Z');

    const pageOneDesc = [
      {
        id: 'ckc',
        curriculumSkillId: 'skill_1',
        masteryLevel: 0.9,
        createdAt: sharedCreatedAt,
      },
      {
        id: 'ckb',
        curriculumSkillId: 'skill_1',
        masteryLevel: 0.7,
        createdAt: sharedCreatedAt,
      },
    ];

    const pageTwoDesc = [
      {
        id: 'cka',
        curriculumSkillId: 'skill_1',
        masteryLevel: 0.5,
        createdAt: sharedCreatedAt,
      },
    ];

    const mocked = mockMasterySnapshotDelegate({
      findManyResponder: async (_args, callIndex) => (callIndex === 0 ? pageOneDesc : pageTwoDesc),
    });

    try {
      const pageOne = await loadStudentSnapshotsPage(studentId, organizationId, undefined, limit);
      assert.equal(pageOne.snapshots.length, 2);
      assert.equal(pageOne.nextCursor, '2026-01-03T00:00:00.000Z|ckb');

      const pageTwo = await loadStudentSnapshotsPage(
        studentId,
        organizationId,
        pageOne.nextCursor ?? undefined,
        limit,
      );
      assert.equal(pageTwo.snapshots.length, 1);

      assert.equal(mocked.findManyCalls.length, 2);
      const secondCallArgs = mocked.findManyCalls[1];
      assert.ok(secondCallArgs);
      assert.deepEqual(secondCallArgs.where, {
        studentId,
        organizationId,
        OR: [
          {
            createdAt: {
              lt: sharedCreatedAt,
            },
          },
          {
            createdAt: sharedCreatedAt,
            id: {
              lt: 'ckb',
            },
          },
        ],
      });

      const allScores = [...pageOne.snapshots, ...pageTwo.snapshots].map((item) => item.masteryLevel);
      const uniqueScores = new Set(allScores);
      assert.equal(allScores.length, 3);
      assert.equal(uniqueScores.size, 3);
      assert.deepEqual([...uniqueScores].sort((a, b) => a - b), [0.5, 0.7, 0.9]);
    } finally {
      mocked.restore();
    }
  });
});
