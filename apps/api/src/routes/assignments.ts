import type { FastifyInstance } from 'fastify';
import { z } from 'zod';

import { sendApiError, zodDetails } from '../lib/apiError.js';
import { prisma } from '../lib/prisma.js';
import { requireAuth } from '../plugins/authGuard.js';

const AssignmentsQuerySchema = z.object({
  cursor: z.string().cuid().optional(),
  limit: z.coerce.number().int().min(1).max(200).default(50),
});

const AssignmentParamsSchema = z.object({
  id: z.string().cuid(),
});

export async function registerAssignmentRoutes(app: FastifyInstance) {
  app.get('/assignments', { preHandler: [requireAuth] }, async (request, reply) => {
    if (!request.auth) {
      return sendApiError(reply, 401, 'UNAUTHORIZED', 'Unauthorized');
    }

    const parsedQuery = AssignmentsQuerySchema.safeParse(request.query);
    if (!parsedQuery.success) {
      return sendApiError(
        reply,
        400,
        'VALIDATION_ERROR',
        'Invalid assignments query',
        zodDetails(parsedQuery.error),
      );
    }

    const limit = parsedQuery.data.limit;
    const assignments = await prisma.assignment.findMany({
      where: {
        organizationId: request.auth.organizationId,
        ...(parsedQuery.data.cursor
          ? {
              id: {
                lt: parsedQuery.data.cursor,
              },
            }
          : {}),
      },
      orderBy: [{ id: 'desc' }],
      take: limit + 1,
      select: {
        id: true,
        title: true,
        courseId: true,
        createdBy: true,
        lockedAt: true,
      },
    });

    const hasMore = assignments.length > limit;
    const pageAssignments = hasMore ? assignments.slice(0, limit) : assignments;
    const lastAssignment = pageAssignments[pageAssignments.length - 1];

    return reply.send({
      assignments: pageAssignments,
      page: {
        nextCursor: hasMore && lastAssignment ? lastAssignment.id : null,
      },
    });
  });

  app.get('/assignments/:id', { preHandler: [requireAuth] }, async (request, reply) => {
    if (!request.auth) {
      return sendApiError(reply, 401, 'UNAUTHORIZED', 'Unauthorized');
    }

    const parsedParams = AssignmentParamsSchema.safeParse(request.params);
    if (!parsedParams.success) {
      return sendApiError(
        reply,
        400,
        'VALIDATION_ERROR',
        'Invalid assignment id',
        zodDetails(parsedParams.error),
      );
    }

    const assignment = await prisma.assignment.findFirst({
      where: {
        id: parsedParams.data.id,
        organizationId: request.auth.organizationId,
      },
      select: {
        id: true,
        title: true,
        courseId: true,
        organizationId: true,
        createdBy: true,
        questions: {
          orderBy: {
            id: 'asc',
          },
          select: {
            id: true,
            type: true,
            prompt: true,
            organizationId: true,
            skillTags: {
              orderBy: {
                id: 'asc',
              },
              select: {
                id: true,
                skillId: true,
                curriculumSkillId: true,
                skill: {
                  select: {
                    id: true,
                    name: true,
                    topicId: true,
                  },
                },
                curriculumSkill: {
                  select: {
                    id: true,
                    name: true,
                    topicId: true,
                    topic: {
                      select: {
                        id: true,
                        name: true,
                        unitId: true,
                        unit: {
                          select: {
                            id: true,
                            name: true,
                            subjectId: true,
                            subject: {
                              select: {
                                id: true,
                                name: true,
                              },
                            },
                          },
                        },
                      },
                    },
                  },
                },
              },
            },
          },
        },
      },
    });

    if (!assignment) {
      return sendApiError(reply, 404, 'ASSIGNMENT_NOT_FOUND', 'Assignment not found');
    }

    return reply.send(assignment);
  });
}
