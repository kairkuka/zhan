import type { Role } from '@prisma/client';
import argon2 from 'argon2';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';

import { env } from './env.js';

export const AuthTokenPayloadSchema = z.object({
  userId: z.string().cuid(),
  organizationId: z.string().cuid(),
  role: z.enum(['ADMIN', 'TEACHER', 'PARENT', 'STUDENT']),
});

export type AuthTokenPayload = z.infer<typeof AuthTokenPayloadSchema>;

let jwtAccessors:
  | {
      sign: (payload: AuthTokenPayload) => string;
      verify: (token: string) => AuthTokenPayload;
    }
  | undefined;

export function initializeAuth(instance: FastifyInstance) {
  jwtAccessors = {
    sign: (payload) =>
      instance.jwt.sign(payload, {
        expiresIn: env.TOKEN_EXPIRES_IN,
      }),
    verify: (token) => {
      const verified = instance.jwt.verify(token);
      return AuthTokenPayloadSchema.parse(verified);
    },
  };
}

function getJwtAccessors() {
  if (!jwtAccessors) {
    throw new Error('JWT helpers are not initialized. Register jwt plugin first.');
  }

  return jwtAccessors;
}

export async function hashPassword(plain: string): Promise<string> {
  return argon2.hash(plain);
}

export async function verifyPassword(hash: string, plain: string): Promise<boolean> {
  try {
    return await argon2.verify(hash, plain);
  } catch {
    return false;
  }
}

export function signToken(payload: AuthTokenPayload): string {
  return getJwtAccessors().sign(AuthTokenPayloadSchema.parse(payload));
}

export function verifyToken(token: string): AuthTokenPayload {
  return getJwtAccessors().verify(token);
}

export function isRoleAllowed(currentRole: Role, allowedRoles: Role[]): boolean {
  return allowedRoles.includes(currentRole);
}
