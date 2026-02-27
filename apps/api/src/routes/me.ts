import type { FastifyInstance } from 'fastify';

import { prisma } from '../lib/prisma.js';
import { requireAuth } from '../plugins/authGuard.js';

export async function registerMeRoutes(app: FastifyInstance) {
  app.get('/me', { preHandler: [requireAuth] }, async (request, reply) => {
    if (!request.auth) {
      return reply.status(401).send({ message: 'Unauthorized' });
    }

    const user = await prisma.user.findUnique({
      where: { id: request.auth.userId },
      select: {
        id: true,
        email: true,
        role: true,
        organizationId: true,
      },
    });

    if (!user) {
      return reply.status(404).send({ message: 'User not found' });
    }

    return reply.send(user);
  });
}
