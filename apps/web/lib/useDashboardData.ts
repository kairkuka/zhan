'use client';

import { useCallback, useEffect, useState } from 'react';

import {
  getReadableErrorMessage,
  getStudentMasteryOverview,
  getStudentMasteryTrend,
  getStudentProjection,
  isAbortError,
  listStudents,
} from './api';
import type { MasteryOverview, StudentProjection, TrendBucket } from '../types/api';

type DashboardData = {
  totalStudents: number;
  sampledStudents: number;
  averageMastery: number;
  studentsAtRisk: number;
  trendStudentId: string;
  trendBuckets: TrendBucket[];
  projection: StudentProjection | null;
};

type DashboardState =
  | { status: 'loading' }
  | { status: 'empty'; message: string }
  | { status: 'error'; message: string }
  | { status: 'ready'; data: DashboardData };

type UseDashboardDataOptions = {
  sampleSize?: number;
  enabled?: boolean;
};

function hasHighRisk(overview: MasteryOverview): boolean {
  if (Array.isArray(overview.skills) && overview.skills.length > 0) {
    return overview.skills.some((skill) => skill.risk === 'HIGH');
  }

  return overview.riskLevel === 'HIGH';
}

function computeAverageMastery(overviews: MasteryOverview[]): number {
  if (overviews.length === 0) {
    return 0;
  }

  const total = overviews.reduce((sum, overview) => sum + overview.averageMastery, 0);
  return total / overviews.length;
}

export function useDashboardData(options: UseDashboardDataOptions = {}) {
  const sampleSize = Math.min(Math.max(options.sampleSize ?? 10, 1), 10);
  const enabled = options.enabled ?? true;

  const [state, setState] = useState<DashboardState>({ status: 'loading' });
  const [refreshKey, setRefreshKey] = useState(0);

  const reload = useCallback(() => {
    setRefreshKey((value) => value + 1);
  }, []);

  useEffect(() => {
    if (!enabled) {
      return;
    }

    const controller = new AbortController();

    async function loadDashboardData() {
      setState({ status: 'loading' });

      try {
        const students = await listStudents({ signal: controller.signal });

        if (students.length === 0) {
          setState({
            status: 'empty',
            message: 'No students found. Add students to see dashboard analytics.',
          });
          return;
        }

        const sampledStudents = students.slice(0, Math.max(1, sampleSize));
        const trendStudent = sampledStudents[0];
        if (!trendStudent) {
          setState({
            status: 'empty',
            message: 'No students found. Add students to see dashboard analytics.',
          });
          return;
        }

        const overviewPromise = Promise.all(
          sampledStudents.map((student) =>
            getStudentMasteryOverview(student.id, {
              signal: controller.signal,
            }),
          ),
        );

        const trendPromise = getStudentMasteryTrend(
          {
            studentId: trendStudent.id,
            bucket: 'week',
          },
          {
            signal: controller.signal,
          },
        );

        const projectionPromise = getStudentProjection(trendStudent.id, {
          signal: controller.signal,
        }).catch(() => null);

        const [overviews, trend, projection] = await Promise.all([
          overviewPromise,
          trendPromise,
          projectionPromise,
        ]);

        if (controller.signal.aborted) {
          return;
        }

        const studentsAtRisk = overviews.filter(hasHighRisk).length;

        setState({
          status: 'ready',
          data: {
            totalStudents: students.length,
            sampledStudents: sampledStudents.length,
            averageMastery: computeAverageMastery(overviews),
            studentsAtRisk,
            trendStudentId: trendStudent.id,
            trendBuckets: trend.buckets,
            projection,
          },
        });
      } catch (error) {
        if (controller.signal.aborted || isAbortError(error)) {
          return;
        }

        setState({
          status: 'error',
          message: getReadableErrorMessage(error, 'Failed to load dashboard data.'),
        });
      }
    }

    void loadDashboardData();

    return () => {
      controller.abort();
    };
  }, [enabled, refreshKey, sampleSize]);

  return {
    state,
    reload,
  };
}

export type { DashboardData, DashboardState };
