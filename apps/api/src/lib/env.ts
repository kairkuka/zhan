import { config as loadEnv } from 'dotenv';
import { resolve } from 'node:path';

import { z } from 'zod';

loadEnv({ path: resolve(process.cwd(), '../../.env') });
loadEnv();

const EnvSchema = z.object({
  API_HOST: z.string().default('0.0.0.0'),
  API_PORT: z.coerce.number().int().positive().default(4000),
  CORS_ORIGIN: z.string().default('http://localhost:3000'),
  DATABASE_URL: z.string().min(1),
  JWT_SECRET: z.string().min(16, 'JWT_SECRET must be at least 16 characters long'),
  TOKEN_EXPIRES_IN: z.string().default('7d'),
  BOOTSTRAP_ADMIN_KEY: z.string().min(1),
});

const parsedEnv = EnvSchema.safeParse(process.env);

if (!parsedEnv.success) {
  throw new Error(`Invalid environment variables: ${parsedEnv.error.message}`);
}

export const env = parsedEnv.data;
