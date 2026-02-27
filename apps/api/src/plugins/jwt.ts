import fastifyJwt from '@fastify/jwt';
import type { FastifyInstance } from 'fastify';

import { initializeAuth } from '../lib/auth.js';
import { env } from '../lib/env.js';

export async function registerJwt(app: FastifyInstance) {
  await app.register(fastifyJwt, {
    secret: env.JWT_SECRET,
  });

  initializeAuth(app);
}
