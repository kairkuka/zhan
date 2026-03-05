import { Role } from '@prisma/client';
import type { Prisma } from '@prisma/client';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';

import { encodeDateIdCursor, isValidDateIdCursor, parseDateIdCursor } from '../lib/cursor.js';
import { sendApiError, zodDetails } from '../lib/apiError.js';
import { prisma } from '../lib/prisma.js';
import { requireAuth } from '../plugins/authGuard.js';

const AttemptsQuerySchema = z.object({
  cursor: z.string().min(1).refine(isValidDateIdCursor, 'Invalid cursor').optional(),
  limit: z.coerce.number().int().min(1).max(200).default(50),
  studentId: z.string().cuid().optional(),
  assignmentId: z.string().cuid().optional(),
});

async function getStudentIdForAuth(userId: string, organizationId: string) {
  const student = await prisma.student.findFirst({
    where: {
      userId,
      organizationId,
    },
    select: {
      id: true,
    },
  });

  return student?.id ?? null;
}

export async function registerAttemptReadRoutes(app: FastifyInstance) {
  app.get('/attempts', { preHandler: [requireAuth] }, async (request, reply) => {
    if (!request.auth) {
      return sendApiError(reply, 401, 'UNAUTHORIZED', 'Unauthorized');
    }

    const parsedQuery = AttemptsQuerySchema.safeParse(request.query);
    if (!parsedQuery.success) {
      return sendApiError(
        reply,
        400,
        'VALIDATION_ERROR',
        'Invalid attempts query',
        zodDetails(parsedQuery.error),
      );
    }

    const parsedCursor = parsedQuery.data.cursor ? parseDateIdCursor(parsedQuery.data.cursor) : null;
    if (parsedQuery.data.cursor && !parsedCursor) {
      return sendApiError(reply, 400, 'INVALID_CURSOR', 'Invalid cursor');
    }

    let effectiveStudentId = parsedQuery.data.studentId;

    if (request.auth.role === Role.STUDENT) {
      const ownStudentId = await getStudentIdForAuth(
        request.auth.userId,
        request.auth.organizationId,
      );

      if (!ownStudentId) {
        return sendApiError(reply, 403, 'FORBIDDEN', 'Student profile not found');
      }

      if (effectiveStudentId && effectiveStudentId !== ownStudentId) {
        return sendApiError(reply, 403, 'FORBIDDEN', 'Cross-student access denied');
      }

      effectiveStudentId = ownStudentId;
    }

    const where: Prisma.AssignmentAttemptWhereInput = {
      organizationId: request.auth.organizationId,
      ...(effectiveStudentId ? { studentId: effectiveStudentId } : {}),
      ...(parsedQuery.data.assignmentId ? { assignmentId: parsedQuery.data.assignmentId } : {}),
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
    const attempts = await prisma.assignmentAttempt.findMany({
      where,
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: limit + 1,
      select: {
        id: true,
        assignmentId: true,
        studentId: true,
        status: true,
        createdAt: true,
        submittedAt: true,
      },
    });

    const hasMore = attempts.length > limit;
    const pageAttempts = hasMore ? attempts.slice(0, limit) : attempts;
    const lastAttempt = pageAttempts[pageAttempts.length - 1];

    const attemptIds = pageAttempts.map((attempt) => attempt.id);
    const scoreGroups =
      attemptIds.length > 0
        ? await prisma.questionAttempt.groupBy({
            by: ['attemptId'],
            where: {
              attemptId: {
                in: attemptIds,
              },
            },
            _sum: {
              score: true,
            },
          })
        : [];

    const scoreMap = new Map<string, number>(
      scoreGroups.map((group) => [group.attemptId, group._sum.score ?? 0]),
    );

    return reply.send({
      attempts: pageAttempts.map((attempt) => ({
        attemptId: attempt.id,
        assignmentId: attempt.assignmentId,
        studentId: attempt.studentId,
        status: attempt.status,
        startedAt: attempt.createdAt,
        submittedAt: attempt.submittedAt,
        totalScore: scoreMap.get(attempt.id) ?? 0,
      })),
      page: {
        nextCursor:
          hasMore && lastAttempt ? encodeDateIdCursor(lastAttempt.createdAt, lastAttempt.id) : null,
      },
    });
  });
}
