import type { FastifyInstance } from 'fastify';
import { z } from 'zod';

import { sendApiError, zodDetails } from '../lib/apiError.js';
import { prisma } from '../lib/prisma.js';
import { requireAuth } from '../plugins/authGuard.js';

const AssignmentParamsSchema = z.object({
  id: z.string().cuid(),
});

export async function registerAssignmentRoutes(app: FastifyInstance) {
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
