import { Role } from '@prisma/client';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { z } from 'zod';

import { prisma } from '../lib/prisma.js';
import { requireAuth, requireRole } from '../plugins/authGuard.js';

const CreateSubjectBodySchema = z.object({
  name: z.string().trim().min(1).max(255),
});

const CreateUnitBodySchema = z.object({
  name: z.string().trim().min(1).max(255),
  subjectId: z.string().cuid(),
});

const CreateTopicBodySchema = z.object({
  name: z.string().trim().min(1).max(255),
  unitId: z.string().cuid(),
  order: z.number().int().positive(),
});

const CreateSkillBodySchema = z.object({
  name: z.string().trim().min(1).max(255),
  topicId: z.string().cuid(),
});

function getRequestAuth(request: FastifyRequest, reply: FastifyReply) {
  if (!request.auth) {
    void reply.status(401).send({ message: 'Unauthorized' });
    return null;
  }

  return request.auth;
}

export async function registerCurriculumRoutes(app: FastifyInstance) {
  app.post(
    '/curriculum/subjects',
    { preHandler: [requireAuth, requireRole([Role.ADMIN])] },
    async (request, reply) => {
      const auth = getRequestAuth(request, reply);
      if (!auth) {
        return;
      }

      const parsed = CreateSubjectBodySchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.status(400).send({ message: parsed.error.message });
      }

      const subject = await prisma.subject.create({
        data: {
          name: parsed.data.name,
          organizationId: auth.organizationId,
        },
      });

      return reply.status(201).send(subject);
    },
  );

  app.post(
    '/curriculum/units',
    { preHandler: [requireAuth, requireRole([Role.ADMIN])] },
    async (request, reply) => {
      const auth = getRequestAuth(request, reply);
      if (!auth) {
        return;
      }

      const parsed = CreateUnitBodySchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.status(400).send({ message: parsed.error.message });
      }

      const subject = await prisma.subject.findUnique({
        where: { id: parsed.data.subjectId },
        select: { id: true, organizationId: true },
      });

      if (!subject || subject.organizationId !== auth.organizationId) {
        return reply.status(400).send({ message: 'Invalid subject relation' });
      }

      const nextOrder =
        (await prisma.unit.count({
          where: {
            subjectId: subject.id,
          },
        })) + 1;

      const unit = await prisma.unit.create({
        data: {
          name: parsed.data.name,
          subjectId: subject.id,
          order: nextOrder,
        },
      });

      return reply.status(201).send(unit);
    },
  );

  app.post(
    '/curriculum/topics',
    { preHandler: [requireAuth, requireRole([Role.ADMIN])] },
    async (request, reply) => {
      const auth = getRequestAuth(request, reply);
      if (!auth) {
        return;
      }

      const parsed = CreateTopicBodySchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.status(400).send({ message: parsed.error.message });
      }

      const unit = await prisma.unit.findUnique({
        where: { id: parsed.data.unitId },
        select: {
          id: true,
          subject: {
            select: {
              organizationId: true,
            },
          },
        },
      });

      if (!unit || unit.subject.organizationId !== auth.organizationId) {
        return reply.status(400).send({ message: 'Invalid unit relation' });
      }

      const topic = await prisma.curriculumTopic.create({
        data: {
          name: parsed.data.name,
          unitId: unit.id,
          order: parsed.data.order,
        },
      });

      return reply.status(201).send(topic);
    },
  );

  app.post(
    '/curriculum/skills',
    { preHandler: [requireAuth, requireRole([Role.ADMIN])] },
    async (request, reply) => {
      const auth = getRequestAuth(request, reply);
      if (!auth) {
        return;
      }

      const parsed = CreateSkillBodySchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.status(400).send({ message: parsed.error.message });
      }

      const topic = await prisma.curriculumTopic.findUnique({
        where: { id: parsed.data.topicId },
        select: {
          id: true,
          unit: {
            select: {
              subject: {
                select: {
                  organizationId: true,
                },
              },
            },
          },
        },
      });

      if (!topic || topic.unit.subject.organizationId !== auth.organizationId) {
        return reply.status(400).send({ message: 'Invalid topic relation' });
      }

      const skill = await prisma.curriculumSkill.create({
        data: {
          name: parsed.data.name,
          topicId: topic.id,
        },
      });

      return reply.status(201).send(skill);
    },
  );

  app.get('/curriculum/subjects', { preHandler: [requireAuth] }, async (request, reply) => {
    const auth = getRequestAuth(request, reply);
    if (!auth) {
      return;
    }

    const subjects = await prisma.subject.findMany({
      where: {
        organizationId: auth.organizationId,
      },
      orderBy: {
        createdAt: 'asc',
      },
      include: {
        units: {
          orderBy: {
            order: 'asc',
          },
          include: {
            topics: {
              orderBy: {
                order: 'asc',
              },
              include: {
                skills: true,
              },
            },
          },
        },
      },
    });

    return reply.send({ subjects });
  });
}
