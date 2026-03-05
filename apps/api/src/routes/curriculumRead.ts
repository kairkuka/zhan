import type { Prisma } from '@prisma/client';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';

import { encodeDateIdCursor, isValidDateIdCursor, parseDateIdCursor } from '../lib/cursor.js';
import { sendApiError, zodDetails } from '../lib/apiError.js';
import { prisma } from '../lib/prisma.js';
import { requireAuth } from '../plugins/authGuard.js';

const CurriculumQuerySchema = z.object({
  cursor: z.string().min(1).refine(isValidDateIdCursor, 'Invalid cursor').optional(),
  limit: z.coerce.number().int().min(1).max(200).default(50),
});

const CurriculumParamsSchema = z.object({
  id: z.string().cuid(),
});

export async function registerCurriculumReadRoutes(app: FastifyInstance) {
  app.get('/curriculum', { preHandler: [requireAuth] }, async (request, reply) => {
    if (!request.auth) {
      return sendApiError(reply, 401, 'UNAUTHORIZED', 'Unauthorized');
    }

    const parsedQuery = CurriculumQuerySchema.safeParse(request.query);
    if (!parsedQuery.success) {
      return sendApiError(
        reply,
        400,
        'VALIDATION_ERROR',
        'Invalid curriculum query',
        zodDetails(parsedQuery.error),
      );
    }

    const parsedCursor = parsedQuery.data.cursor ? parseDateIdCursor(parsedQuery.data.cursor) : null;
    if (parsedQuery.data.cursor && !parsedCursor) {
      return sendApiError(reply, 400, 'INVALID_CURSOR', 'Invalid cursor');
    }

    const where: Prisma.SubjectWhereInput = {
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

    const subjects = await prisma.subject.findMany({
      where,
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: limit + 1,
      select: {
        id: true,
        name: true,
        createdAt: true,
        _count: {
          select: {
            units: true,
          },
        },
      },
    });

    const hasMore = subjects.length > limit;
    const pageItems = hasMore ? subjects.slice(0, limit) : subjects;
    const lastItem = pageItems[pageItems.length - 1];

    return reply.send({
      items: pageItems.map((subject) => ({
        id: subject.id,
        name: subject.name,
        createdAt: subject.createdAt,
        unitsCount: subject._count.units,
      })),
      nextCursor: hasMore && lastItem ? encodeDateIdCursor(lastItem.createdAt, lastItem.id) : null,
    });
  });

  app.get('/curriculum/:id', { preHandler: [requireAuth] }, async (request, reply) => {
    if (!request.auth) {
      return sendApiError(reply, 401, 'UNAUTHORIZED', 'Unauthorized');
    }

    const parsedParams = CurriculumParamsSchema.safeParse(request.params);
    if (!parsedParams.success) {
      return sendApiError(
        reply,
        400,
        'VALIDATION_ERROR',
        'Invalid curriculum id',
        zodDetails(parsedParams.error),
      );
    }

    const subject = await prisma.subject.findFirst({
      where: {
        id: parsedParams.data.id,
        organizationId: request.auth.organizationId,
      },
      select: {
        id: true,
        name: true,
        createdAt: true,
        units: {
          orderBy: [{ order: 'asc' }, { id: 'asc' }],
          select: {
            id: true,
            name: true,
            order: true,
            topics: {
              orderBy: [{ order: 'asc' }, { id: 'asc' }],
              select: {
                id: true,
                name: true,
                order: true,
                skills: {
                  orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
                  select: {
                    id: true,
                    name: true,
                    questionTags: {
                      where: {
                        organizationId: request.auth.organizationId,
                      },
                      orderBy: {
                        id: 'asc',
                      },
                      select: {
                        id: true,
                        questionId: true,
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

    if (!subject) {
      return sendApiError(reply, 404, 'CURRICULUM_NOT_FOUND', 'Curriculum not found');
    }

    return reply.send(subject);
  });
}
