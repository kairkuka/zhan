import { Role } from '@prisma/client';
import type { Prisma } from '@prisma/client';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';

import { encodeDateIdCursor, isValidDateIdCursor, parseDateIdCursor } from '../lib/cursor.js';
import { sendApiError, zodDetails } from '../lib/apiError.js';
import { prisma } from '../lib/prisma.js';
import { requireAuth, requireRole } from '../plugins/authGuard.js';

const HARD_CAP = 10_000;

const StudentParamsSchema = z.object({
  id: z.string().cuid(),
});

const SnapshotQuerySchema = z.object({
  cursor: z.string().min(1).refine(isValidDateIdCursor, 'Invalid cursor').optional(),
  limit: z.coerce.number().int().min(1).max(200).default(50),
});

function getRiskLevel(masteryLevel: number): 'LOW' | 'MEDIUM' | 'HIGH' {
  if (masteryLevel >= 0.8) {
    return 'LOW';
  }

  if (masteryLevel >= 0.5) {
    return 'MEDIUM';
  }

  return 'HIGH';
}

export async function registerMasterySnapshotRoutes(app: FastifyInstance) {
  app.get(
    '/students/:id/mastery-snapshots',
    { preHandler: [requireAuth, requireRole([Role.TEACHER, Role.ADMIN])] },
    async (request, reply) => {
      if (!request.auth) {
        return sendApiError(reply, 401, 'UNAUTHORIZED', 'Unauthorized');
      }

      const parsedParams = StudentParamsSchema.safeParse(request.params);
      if (!parsedParams.success) {
        return sendApiError(
          reply,
          400,
          'VALIDATION_ERROR',
          'Invalid student id',
          zodDetails(parsedParams.error),
        );
      }

      const parsedQuery = SnapshotQuerySchema.safeParse(request.query);
      if (!parsedQuery.success) {
        return sendApiError(
          reply,
          400,
          'VALIDATION_ERROR',
          'Invalid snapshots query',
          zodDetails(parsedQuery.error),
        );
      }

      const student = await prisma.student.findFirst({
        where: {
          id: parsedParams.data.id,
          organizationId: request.auth.organizationId,
        },
        select: {
          id: true,
        },
      });

      if (!student) {
        return sendApiError(reply, 404, 'STUDENT_NOT_FOUND', 'Student not found');
      }

      const parsedCursor = parsedQuery.data.cursor ? parseDateIdCursor(parsedQuery.data.cursor) : null;
      if (parsedQuery.data.cursor && !parsedCursor) {
        return sendApiError(reply, 400, 'INVALID_CURSOR', 'Invalid cursor');
      }

      const where: Prisma.MasterySnapshotWhereInput = {
        studentId: student.id,
        organizationId: request.auth.organizationId,
      };

      if (parsedCursor?.id) {
        where.OR = [
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
        ];
      } else if (parsedCursor) {
        where.createdAt = {
          lt: parsedCursor.createdAt,
        };
      }

      const limit = parsedQuery.data.limit;
      const totalCount = await prisma.masterySnapshot.count({ where });

      const snapshots =
        totalCount > HARD_CAP
          ? await prisma.masterySnapshot.findMany({
              where,
              orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
              take: HARD_CAP,
              select: {
                id: true,
                createdAt: true,
                masteryLevel: true,
              },
            })
          : await prisma.masterySnapshot.findMany({
              where,
              orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
              take: limit + 1,
              select: {
                id: true,
                createdAt: true,
                masteryLevel: true,
              },
            });

      const hasMore = snapshots.length > limit;
      const pageSnapshots = hasMore ? snapshots.slice(0, limit) : snapshots;
      const lastSnapshot = pageSnapshots[pageSnapshots.length - 1];

      return reply.send({
        snapshots: pageSnapshots.map((snapshot) => ({
          id: snapshot.id,
          createdAt: snapshot.createdAt,
          averageMastery: snapshot.masteryLevel,
          skillsTracked: 1,
          riskLevel: getRiskLevel(snapshot.masteryLevel),
        })),
        page: {
          nextCursor:
            hasMore && lastSnapshot
              ? encodeDateIdCursor(lastSnapshot.createdAt, lastSnapshot.id)
              : null,
        },
      });
    },
  );
}
