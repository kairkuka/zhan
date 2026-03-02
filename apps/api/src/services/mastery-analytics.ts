export type MasteryHistoryPoint = {
  masteryLevel: number;
  createdAt: Date;
};

export type ComputedMasteryTrend = {
  trend: 'UP' | 'DOWN' | 'FLAT' | 'INSUFFICIENT_DATA';
  velocity: number;
  risk: 'LOW' | 'MEDIUM' | 'HIGH' | 'UNKNOWN';
};

export function computeMasteryTrend(history: MasteryHistoryPoint[]): ComputedMasteryTrend {
  if (history.length < 2) {
    return {
      trend: 'INSUFFICIENT_DATA',
      velocity: 0,
      risk: 'UNKNOWN',
    };
  }

  const firstPoint = history[0];
  const lastPoint = history[history.length - 1];
  if (!firstPoint || !lastPoint) {
    return {
      trend: 'INSUFFICIENT_DATA',
      velocity: 0,
      risk: 'UNKNOWN',
    };
  }

  const first = firstPoint.masteryLevel;
  const last = lastPoint.masteryLevel;

  const delta = last - first;
  const velocity = delta / history.length;

  let trend: 'UP' | 'DOWN' | 'FLAT';
  if (delta > 0.05) {
    trend = 'UP';
  } else if (delta < -0.05) {
    trend = 'DOWN';
  } else {
    trend = 'FLAT';
  }

  let risk: 'LOW' | 'MEDIUM' | 'HIGH';
  if (last >= 0.8) {
    risk = 'LOW';
  } else if (last >= 0.5) {
    risk = 'MEDIUM';
  } else {
    risk = 'HIGH';
  }

  return { trend, velocity, risk };
}
