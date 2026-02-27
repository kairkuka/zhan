import type { Role } from '@prisma/client';
import type { FastifyReply, FastifyRequest } from 'fastify';

import { AuthTokenPayloadSchema, isRoleAllowed } from '../lib/auth.js';

export async function requireAuth(request: FastifyRequest, reply: FastifyReply) {
  try {
    await request.jwtVerify();
    request.auth = AuthTokenPayloadSchema.parse(request.user);
  } catch {
    return reply.status(401).send({ message: 'Unauthorized' });
  }
}

export function requireRole(roles: Role[]) {
  return async (request: FastifyRequest, reply: FastifyReply) => {
    if (!request.auth) {
      return reply.status(401).send({ message: 'Unauthorized' });
    }

    if (!isRoleAllowed(request.auth.role, roles)) {
      return reply.status(403).send({ message: 'Forbidden' });
    }
  };
}

export function requireSameOrg(resourceOrgId: string) {
  return (request: FastifyRequest, reply: FastifyReply): boolean => {
    if (!request.auth) {
      void reply.status(401).send({ message: 'Unauthorized' });
      return false;
    }

    if (request.auth.organizationId !== resourceOrgId) {
      void reply.status(403).send({ message: 'Cross-organization access denied' });
      return false;
    }

    return true;
  };
}
