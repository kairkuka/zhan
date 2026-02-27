import { Role } from '@prisma/client';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';

import { sendApiError, zodDetails } from '../lib/apiError.js';
import { prisma } from '../lib/prisma.js';
import { requireAuth, requireRole } from '../plugins/authGuard.js';

const QuestionQuerySchema = z.object({
  curriculumSkillId: z.string().cuid().optional(),
  limit: z.coerce.number().int().positive().max(100).default(20),
  cursor: z.string().cuid().optional(),
  order: z.enum(['asc', 'desc']).default('asc'),
});

export async function registerQuestionRoutes(app: FastifyInstance) {
  app.get('/questions', { preHandler: [requireAuth, requireRole([Role.ADMIN])] }, async (request, reply) => {
    if (!request.auth) {
      return sendApiError(reply, 401, 'UNAUTHORIZED', 'Unauthorized');
    }

    const parsedQuery = QuestionQuerySchema.safeParse(request.query);
    if (!parsedQuery.success) {
      return sendApiError(
        reply,
        400,
        'VALIDATION_ERROR',
        'Invalid query parameters',
        zodDetails(parsedQuery.error),
      );
    }

    const { curriculumSkillId, limit, cursor, order } = parsedQuery.data;

    if (curriculumSkillId) {
      const skill = await prisma.curriculumSkill.findFirst({
        where: {
          id: curriculumSkillId,
          topic: {
            unit: {
              subject: {
                organizationId: request.auth.organizationId,
              },
            },
          },
        },
        select: { id: true },
      });

      if (!skill) {
        return sendApiError(reply, 400, 'INVALID_RELATION', 'Invalid curriculum skill relation');
      }
    }

    if (cursor) {
      const cursorQuestion = await prisma.question.findFirst({
        where: {
          id: cursor,
          organizationId: request.auth.organizationId,
          ...(curriculumSkillId
            ? {
                skillTags: {
                  some: {
                    curriculumSkillId,
                  },
                },
              }
            : {}),
        },
        select: { id: true },
      });

      if (!cursorQuestion) {
        return sendApiError(reply, 400, 'INVALID_CURSOR', 'Invalid cursor');
      }
    }

    const questions = await prisma.question.findMany({
      where: {
        organizationId: request.auth.organizationId,
        ...(curriculumSkillId
          ? {
              skillTags: {
                some: {
                  curriculumSkillId,
                },
              },
            }
          : {}),
      },
      orderBy: {
        id: order,
      },
      ...(cursor
        ? {
            cursor: {
              id: cursor,
            },
            skip: 1,
          }
        : {}),
      take: limit + 1,
      select: {
        id: true,
        assignmentId: true,
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
    });

    const hasNextPage = questions.length > limit;
    const paginatedQuestions = hasNextPage ? questions.slice(0, limit) : questions;
    const nextCursor = hasNextPage ? paginatedQuestions[paginatedQuestions.length - 1]?.id ?? null : null;

    return reply.send({
      questions: paginatedQuestions,
      page: {
        nextCursor,
      },
    });
  });
}
