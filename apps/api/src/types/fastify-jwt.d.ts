import type { AuthTokenPayload } from '../lib/auth.js';

declare module '@fastify/jwt' {
  interface FastifyJWT {
    payload: AuthTokenPayload;
    user: AuthTokenPayload;
  }
}

declare module 'fastify' {
  interface FastifyRequest {
    auth?: AuthTokenPayload;
  }
}
