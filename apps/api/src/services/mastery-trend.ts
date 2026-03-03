export type MasteryTrendBucket = 'day' | 'week' | 'month';

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
