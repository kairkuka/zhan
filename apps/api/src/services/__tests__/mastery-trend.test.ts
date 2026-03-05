import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { prisma } from '../../lib/prisma.js';
import {
  HARD_CAP,
  aggregateMasteryTrend,
  loadMasteryTrendSnapshotsPage,
} from '../mastery-trend.js';

type CountArgs = Parameters<typeof prisma.masterySnapshot.count>[0];
type FindManyArgs = Parameters<typeof prisma.masterySnapshot.findMany>[0];
type FindManyResult = Awaited<ReturnType<typeof prisma.masterySnapshot.findMany>>;

type MockOptions = {
  countResponder?: (args: CountArgs, callIndex: number) => Promise<number> | number;
  findManyResponder: (args: FindManyArgs, callIndex: number) => Promise<unknown[]> | unknown[];
};

function mockMasterySnapshotDelegate(options: MockOptions) {
  const originalCount = prisma.masterySnapshot.count;
  const originalFindMany = prisma.masterySnapshot.findMany;

  const countCalls: CountArgs[] = [];
  const findManyCalls: FindManyArgs[] = [];
  let countCallIndex = 0;
  let findManyCallIndex = 0;

  (prisma.masterySnapshot as { count: (args: CountArgs) => Promise<number> }).count = async (
    args: CountArgs,
  ) => {
    countCalls.push(args);
    if (!options.countResponder) {
      return 0;
    }

    return options.countResponder(args, countCallIndex++);
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

function assertBucketsCloseTo(
  actual: Array<{ date: string; averageMastery: number; skillsTracked: number }>,
  expected: Array<{ date: string; averageMastery: number; skillsTracked: number }>,
) {
  assert.equal(actual.length, expected.length);

  for (let index = 0; index < expected.length; index += 1) {
    const actualItem = actual[index];
    const expectedItem = expected[index];

    assert.ok(actualItem);
    assert.ok(expectedItem);

    assert.equal(actualItem.date, expectedItem.date);
    assert.equal(actualItem.skillsTracked, expectedItem.skillsTracked);
    assert.ok(Math.abs(actualItem.averageMastery - expectedItem.averageMastery) < 1e-12);
  }
}

describe('aggregateMasteryTrend', () => {
  it('aggregates snapshots by day', () => {
    const snapshots = [
      {
        curriculumSkillId: 'skill_1',
        masteryLevel: 0.4,
        createdAt: new Date('2026-03-02T10:00:00.000Z'),
      },
      {
        curriculumSkillId: 'skill_2',
        masteryLevel: 0.8,
        createdAt: new Date('2026-03-02T12:00:00.000Z'),
      },
      {
        curriculumSkillId: 'skill_1',
        masteryLevel: 0.6,
        createdAt: new Date('2026-03-03T09:00:00.000Z'),
      },
    ];

    const buckets = aggregateMasteryTrend(snapshots, 'day');

    assertBucketsCloseTo(buckets, [
      {
        date: '2026-03-02',
        averageMastery: 0.6,
        skillsTracked: 2,
      },
      {
        date: '2026-03-03',
        averageMastery: 0.6,
        skillsTracked: 1,
      },
    ]);
  });

  it('aggregates snapshots by week (ISO week start Monday)', () => {
    const snapshots = [
      {
        curriculumSkillId: 'skill_1',
        masteryLevel: 0.4,
        createdAt: new Date('2026-03-02T10:00:00.000Z'),
      },
      {
        curriculumSkillId: 'skill_2',
        masteryLevel: 0.8,
        createdAt: new Date('2026-03-04T10:00:00.000Z'),
      },
      {
        curriculumSkillId: 'skill_1',
        masteryLevel: 0.5,
        createdAt: new Date('2026-03-09T10:00:00.000Z'),
      },
    ];

    const buckets = aggregateMasteryTrend(snapshots, 'week');

    assertBucketsCloseTo(buckets, [
      {
        date: '2026-03-02',
        averageMastery: 0.6,
        skillsTracked: 2,
      },
      {
        date: '2026-03-09',
        averageMastery: 0.5,
        skillsTracked: 1,
      },
    ]);
  });

  it('aggregates snapshots by month', () => {
    const snapshots = [
      {
        curriculumSkillId: 'skill_1',
        masteryLevel: 0.4,
        createdAt: new Date('2026-03-02T10:00:00.000Z'),
      },
      {
        curriculumSkillId: 'skill_2',
        masteryLevel: 0.8,
        createdAt: new Date('2026-03-25T10:00:00.000Z'),
      },
      {
        curriculumSkillId: 'skill_1',
        masteryLevel: 0.5,
        createdAt: new Date('2026-04-03T10:00:00.000Z'),
      },
    ];

    const buckets = aggregateMasteryTrend(snapshots, 'month');

    assertBucketsCloseTo(buckets, [
      {
        date: '2026-03-01',
        averageMastery: 0.6,
        skillsTracked: 2,
      },
      {
        date: '2026-04-01',
        averageMastery: 0.5,
        skillsTracked: 1,
      },
    ]);
  });

  it('returns empty buckets for empty range', () => {
    const buckets = aggregateMasteryTrend([], 'week');
    assert.deepEqual(buckets, []);
  });

  it('returns one bucket for a single snapshot', () => {
    const buckets = aggregateMasteryTrend(
      [
        {
          curriculumSkillId: 'skill_1',
          masteryLevel: 0.75,
          createdAt: new Date('2026-05-10T10:00:00.000Z'),
        },
      ],
      'day',
    );

    assert.deepEqual(buckets, [
      {
        date: '2026-05-10',
        averageMastery: 0.75,
        skillsTracked: 1,
      },
    ]);
  });
});

describe('loadMasteryTrendSnapshotsPage', () => {
  const studentId = 'student_test_id';
  const organizationId = 'org_test_id';

  it('provides deterministic pagination with identical timestamps without duplicates', async () => {
    const sharedCreatedAt = new Date('2026-03-01T00:00:00.000Z');

    const rowsPageOne = [
      {
        id: 'a',
        curriculumSkillId: 'skill_1',
        masteryLevel: 0.1,
        createdAt: sharedCreatedAt,
      },
      {
        id: 'b',
        curriculumSkillId: 'skill_2',
        masteryLevel: 0.2,
        createdAt: sharedCreatedAt,
      },
      {
        id: 'c',
        curriculumSkillId: 'skill_3',
        masteryLevel: 0.3,
        createdAt: sharedCreatedAt,
      },
    ];

    const rowsPageTwo = [
      {
        id: 'c',
        curriculumSkillId: 'skill_3',
        masteryLevel: 0.3,
        createdAt: sharedCreatedAt,
      },
    ];

    const mocked = mockMasterySnapshotDelegate({
      countResponder: (_args, countIndex) => (countIndex === 0 ? 3 : 1),
      findManyResponder: (_args, findIndex) => (findIndex === 0 ? rowsPageOne : rowsPageTwo),
    });

    try {
      const firstPage = await loadMasteryTrendSnapshotsPage({
        studentId,
        organizationId,
        limit: 2,
      });

      assert.equal(firstPage.snapshots.length, 2);
      assert.equal(firstPage.nextCursor, '2026-03-01T00:00:00.000Z|b');

      const secondPage = await loadMasteryTrendSnapshotsPage({
        studentId,
        organizationId,
        cursor: firstPage.nextCursor ?? undefined,
        limit: 2,
      });

      assert.equal(secondPage.snapshots.length, 1);
      assert.equal(secondPage.nextCursor, null);

      assert.equal(mocked.findManyCalls.length, 2);
      const firstQuery = mocked.findManyCalls[0];
      const secondQuery = mocked.findManyCalls[1];
      assert.ok(firstQuery);
      assert.ok(secondQuery);

      assert.deepEqual(firstQuery.orderBy, [{ createdAt: 'asc' }, { id: 'asc' }]);
      assert.equal(firstQuery.take, 3);

      assert.deepEqual(secondQuery.where, {
        studentId,
        organizationId,
        OR: [
          {
            createdAt: {
              gt: sharedCreatedAt,
            },
          },
          {
            createdAt: sharedCreatedAt,
            id: {
              gt: 'b',
            },
          },
        ],
      });

      const scores = [...firstPage.snapshots, ...secondPage.snapshots].map((item) => item.masteryLevel);
      assert.deepEqual(scores.sort((a, b) => a - b), [0.1, 0.2, 0.3]);
      assert.equal(new Set(scores).size, 3);
    } finally {
      mocked.restore();
    }
  });

  it('supports old cursor format for backward compatibility', async () => {
    const cursor = '2026-03-01T00:00:00.000Z';
    const mocked = mockMasterySnapshotDelegate({
      countResponder: () => 1,
      findManyResponder: async () => [
        {
          id: 'x1',
          curriculumSkillId: 'skill_1',
          masteryLevel: 0.4,
          createdAt: new Date('2026-03-01T00:00:01.000Z'),
        },
      ],
    });

    try {
      const result = await loadMasteryTrendSnapshotsPage({
        studentId,
        organizationId,
        cursor,
        limit: 2,
      });

      assert.equal(result.nextCursor, null);
      assert.equal(mocked.findManyCalls.length, 1);
      const query = mocked.findManyCalls[0];
      assert.ok(query);
      assert.deepEqual(query.where, {
        studentId,
        organizationId,
        createdAt: {
          gt: new Date(cursor),
        },
      });
      assert.deepEqual(query.orderBy, [{ createdAt: 'asc' }, { id: 'asc' }]);
    } finally {
      mocked.restore();
    }
  });

  it('applies hard cap and returns at most 10000 snapshots from 10001', async () => {
    const cappedDescRows = Array.from({ length: HARD_CAP }, (_, index) => {
      const rank = HARD_CAP - index;
      return {
        id: `id-${String(rank).padStart(5, '0')}`,
        curriculumSkillId: `skill-${rank % 5}`,
        masteryLevel: rank / HARD_CAP,
        createdAt: new Date(Date.UTC(2026, 2, 1, 0, 0, rank)),
      };
    });

    const mocked = mockMasterySnapshotDelegate({
      countResponder: () => HARD_CAP + 1,
      findManyResponder: async () => cappedDescRows,
    });

    try {
      const result = await loadMasteryTrendSnapshotsPage({
        studentId,
        organizationId,
        limit: HARD_CAP,
      });

      assert.equal(result.snapshots.length, HARD_CAP);
      assert.equal(result.nextCursor, null);

      assert.equal(mocked.findManyCalls.length, 1);
      const query = mocked.findManyCalls[0];
      assert.ok(query);
      assert.deepEqual(query.orderBy, [{ createdAt: 'desc' }, { id: 'desc' }]);
      assert.equal(query.take, HARD_CAP);
    } finally {
      mocked.restore();
    }
  });

  it('returns deterministic nextCursor format', async () => {
    const rows = [
      {
        id: 'id-001',
        curriculumSkillId: 'skill-1',
        masteryLevel: 0.1,
        createdAt: new Date('2026-03-01T00:00:00.000Z'),
      },
      {
        id: 'id-002',
        curriculumSkillId: 'skill-2',
        masteryLevel: 0.2,
        createdAt: new Date('2026-03-01T00:00:01.000Z'),
      },
      {
        id: 'id-003',
        curriculumSkillId: 'skill-3',
        masteryLevel: 0.3,
        createdAt: new Date('2026-03-01T00:00:02.000Z'),
      },
    ];

    const mocked = mockMasterySnapshotDelegate({
      countResponder: () => 3,
      findManyResponder: () => rows,
    });

    try {
      const result = await loadMasteryTrendSnapshotsPage({
        studentId,
        organizationId,
        limit: 2,
      });

      assert.equal(result.nextCursor, '2026-03-01T00:00:01.000Z|id-002');
    } finally {
      mocked.restore();
    }
  });
});
