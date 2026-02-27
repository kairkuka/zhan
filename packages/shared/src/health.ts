import { z } from 'zod';

export const HealthResponseSchema = z.object({
  ok: z.boolean(),
  service: z.literal('api'),
});

export type HealthResponse = z.infer<typeof HealthResponseSchema>;
