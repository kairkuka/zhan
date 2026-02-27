import cors from '@fastify/cors';
import Fastify from 'fastify';

import { HealthResponseSchema, type HealthResponse } from '@skyvern/shared';

export async function buildServer() {
  const app = Fastify({
    logger: true,
  });

  await app.register(cors, {
    origin: process.env.CORS_ORIGIN ?? 'http://localhost:3000',
  });

  app.get('/health', async (): Promise<HealthResponse> => {
    return HealthResponseSchema.parse({ ok: true, service: 'api' });
  });

  return app;
}
