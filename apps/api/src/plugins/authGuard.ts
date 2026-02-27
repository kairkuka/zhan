import type { Role } from '@prisma/client';
import type { FastifyReply, FastifyRequest } from 'fastify';

import { AuthTokenPayloadSchema, isRoleAllowed } from '../lib/auth.js';
import { sendApiError } from '../lib/apiError.js';

export async function requireAuth(request: FastifyRequest, reply: FastifyReply) {
  try {
    await request.jwtVerify();
    request.auth = AuthTokenPayloadSchema.parse(request.user);
  } catch {
    return sendApiError(reply, 401, 'UNAUTHORIZED', 'Unauthorized');
  }
}

export function requireRole(roles: Role[]) {
  return async (request: FastifyRequest, reply: FastifyReply) => {
    if (!request.auth) {
      return sendApiError(reply, 401, 'UNAUTHORIZED', 'Unauthorized');
    }

    if (!isRoleAllowed(request.auth.role, roles)) {
      return sendApiError(reply, 403, 'FORBIDDEN', 'Forbidden');
    }
  };
}

export function requireSameOrg(resourceOrgId: string) {
  return (request: FastifyRequest, reply: FastifyReply): boolean => {
    if (!request.auth) {
      void sendApiError(reply, 401, 'UNAUTHORIZED', 'Unauthorized');
      return false;
    }

    if (request.auth.organizationId !== resourceOrgId) {
      void sendApiError(reply, 403, 'FORBIDDEN', 'Cross-organization access denied');
      return false;
    }

    return true;
  };
}
