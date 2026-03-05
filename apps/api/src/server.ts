import cors from '@fastify/cors';
import Fastify from 'fastify';

import { HealthResponseSchema, type HealthResponse } from '@skyvern/shared';
import { env } from './lib/env.js';
import { registerAdminRoutes } from './routes/admin.js';
import { registerAssignmentRoutes } from './routes/assignments.js';
import { registerAttemptRoutes } from './routes/attempts.js';
import { registerAttemptReadRoutes } from './routes/attemptsRead.js';
import { registerAuthRoutes } from './routes/auth.js';
import { registerCurriculumRoutes } from './routes/curriculum.js';
import { registerCurriculumReadRoutes } from './routes/curriculumRead.js';
import { registerMasterySnapshotRoutes } from './routes/masterySnapshots.js';
import { registerMeRoutes } from './routes/me.js';
import { registerProjectionRoutes } from './routes/projection.js';
import { registerQuestionRoutes } from './routes/questions.js';
import { registerStudentRoutes } from './routes/students.js';
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
  await registerAssignmentRoutes(app);
  await registerAttemptRoutes(app);
  await registerAttemptReadRoutes(app);
  await registerQuestionRoutes(app);
  await registerCurriculumRoutes(app);
  await registerCurriculumReadRoutes(app);
  await registerStudentRoutes(app);
  await registerMasterySnapshotRoutes(app);
  await registerProjectionRoutes(app);

  return app;
}
