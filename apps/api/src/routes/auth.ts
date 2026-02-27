import { Role } from '@prisma/client';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';

import { hashPassword, signToken, verifyPassword } from '../lib/auth.js';
import { env } from '../lib/env.js';
import { prisma } from '../lib/prisma.js';

const LoginBodySchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
});

const RegisterBodySchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
  role: z.nativeEnum(Role),
  organizationId: z.string().cuid(),
});

export async function registerAuthRoutes(app: FastifyInstance) {
  app.post('/auth/login', async (request, reply) => {
    const parsed = LoginBodySchema.safeParse(request.body);

    if (!parsed.success) {
      return reply.status(400).send({ message: parsed.error.message });
    }

    const { email, password } = parsed.data;

    const user = await prisma.user.findUnique({
      where: { email },
    });

    if (!user) {
      return reply.status(401).send({ message: 'Invalid credentials' });
    }

    const isPasswordValid = await verifyPassword(user.passwordHash, password);

    if (!isPasswordValid) {
      return reply.status(401).send({ message: 'Invalid credentials' });
    }

    const token = signToken({
      userId: user.id,
      organizationId: user.organizationId,
      role: user.role,
    });

    return reply.send({
      token,
      user: {
        id: user.id,
        email: user.email,
        role: user.role,
        organizationId: user.organizationId,
      },
    });
  });

  app.post('/auth/register', async (request, reply) => {
    const bootstrapHeader = request.headers['x-bootstrap-admin'];
    const bootstrapKey = Array.isArray(bootstrapHeader) ? bootstrapHeader[0] : bootstrapHeader;

    if (bootstrapKey !== env.BOOTSTRAP_ADMIN_KEY) {
      return reply.status(403).send({ message: 'Register endpoint is disabled' });
    }

    const parsed = RegisterBodySchema.safeParse(request.body);

    if (!parsed.success) {
      return reply.status(400).send({ message: parsed.error.message });
    }

    const { email, password, role, organizationId } = parsed.data;

    const organization = await prisma.organization.findUnique({
      where: { id: organizationId },
      select: { id: true },
    });

    if (!organization) {
      return reply.status(404).send({ message: 'Organization not found' });
    }

    const passwordHash = await hashPassword(password);

    try {
      const user = await prisma.$transaction(async (tx) => {
        const createdUser = await tx.user.create({
          data: {
            email,
            passwordHash,
            role,
            organizationId,
          },
        });

        if (role === Role.TEACHER) {
          await tx.teacher.create({
            data: {
              userId: createdUser.id,
              organizationId,
            },
          });
        }

        if (role === Role.PARENT) {
          await tx.parent.create({
            data: {
              userId: createdUser.id,
              organizationId,
            },
          });
        }

        if (role === Role.STUDENT) {
          await tx.student.create({
            data: {
              userId: createdUser.id,
              organizationId,
            },
          });
        }

        return createdUser;
      });

      return reply.status(201).send({
        user: {
          id: user.id,
          email: user.email,
          role: user.role,
          organizationId: user.organizationId,
        },
      });
    } catch (error) {
      if (
        typeof error === 'object' &&
        error !== null &&
        'code' in error &&
        error.code === 'P2002'
      ) {
        return reply.status(409).send({ message: 'User with this email already exists' });
      }

      throw error;
    }
  });
}
