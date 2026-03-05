import type { FastifyInstance } from 'fastify';

import { sendApiError } from '../lib/apiError.js';
import { prisma } from '../lib/prisma.js';
import { requireAuth } from '../plugins/authGuard.js';

export async function registerStudentRoutes(app: FastifyInstance) {
  app.get('/students', { preHandler: [requireAuth] }, async (request, reply) => {
    if (!request.auth) {
      return sendApiError(reply, 401, 'UNAUTHORIZED', 'Unauthorized');
    }

    const students = await prisma.student.findMany({
      where: {
        organizationId: request.auth.organizationId,
      },
      select: {
        id: true,
      },
      orderBy: [
        {
          user: {
            createdAt: 'desc',
          },
        },
        {
          id: 'desc',
        },
      ],
    });

    return reply.send(students);
  });
}
