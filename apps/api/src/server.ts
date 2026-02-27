import cors from '@fastify/cors';
import Fastify from 'fastify';

import { HealthResponseSchema, type HealthResponse } from '@skyvern/shared';
import { env } from './lib/env.js';
import { registerAdminRoutes } from './routes/admin.js';
import { registerAuthRoutes } from './routes/auth.js';
import { registerMeRoutes } from './routes/me.js';
import { registerJwt } from './plugins/jwt.js';

export async function buildServer() {
  const app = Fastify({
    logger: true,
  });

  await app.register(cors, {
    origin: env.CORS_ORIGIN,
    allowedHeaders: ['Content-Type', 'Authorization', 'x-bootstrap-admin'],
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  });

  await registerJwt(app);

  app.get('/health', async (): Promise<HealthResponse> => {
    return HealthResponseSchema.parse({ ok: true, service: 'api' });
  });

  await registerAuthRoutes(app);
  await registerMeRoutes(app);
  await registerAdminRoutes(app);

  return app;
}
