import { Role } from '@prisma/client';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';

import { prisma } from '../lib/prisma.js';
import { requireAuth, requireRole } from '../plugins/authGuard.js';

const QuestionQuerySchema = z.object({
  curriculumSkillId: z.string().cuid().optional(),
});

export async function registerQuestionRoutes(app: FastifyInstance) {
  app.get('/questions', { preHandler: [requireAuth, requireRole([Role.ADMIN])] }, async (request, reply) => {
    if (!request.auth) {
      return reply.status(401).send({ message: 'Unauthorized' });
    }

    const parsedQuery = QuestionQuerySchema.safeParse(request.query);
    if (!parsedQuery.success) {
      return reply.status(400).send({ message: parsedQuery.error.message });
    }

    const { curriculumSkillId } = parsedQuery.data;

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
        return reply.status(400).send({ message: 'Invalid curriculum skill relation' });
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
        id: 'asc',
      },
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

    return reply.send({ questions });
  });
}
