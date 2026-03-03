import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { aggregateMasteryTrend } from '../mastery-trend.js';

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
