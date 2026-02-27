import { Role } from '@prisma/client';
import type { FastifyInstance } from 'fastify';

import { prisma } from '../lib/prisma.js';
import { requireAuth, requireRole, requireSameOrg } from '../plugins/authGuard.js';

export async function registerAdminRoutes(app: FastifyInstance) {
  app.get('/admin/org/users', { preHandler: [requireAuth, requireRole([Role.ADMIN])] }, async (request, reply) => {
    if (!request.auth) {
      return reply.status(401).send({ message: 'Unauthorized' });
    }

    const users = await prisma.user.findMany({
      where: {
        organizationId: request.auth.organizationId,
      },
      orderBy: {
        createdAt: 'asc',
      },
      select: {
        id: true,
        email: true,
        role: true,
        organizationId: true,
      },
    });

    const firstUser = users.at(0);
    if (firstUser && !requireSameOrg(firstUser.organizationId)(request, reply)) {
      return;
    }

    return reply.send({ users });
  });
}
