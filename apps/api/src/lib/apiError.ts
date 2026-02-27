import type { FastifyReply } from 'fastify';
import type { ZodError } from 'zod';

type ApiErrorPayload = {
  error: {
    code: string;
    message: string;
    details?: unknown;
  };
};

export function sendApiError(
  reply: FastifyReply,
  statusCode: number,
  code: string,
  message: string,
  details?: unknown,
) {
  const payload: ApiErrorPayload = details
    ? {
        error: {
          code,
          message,
          details,
        },
      }
    : {
        error: {
          code,
          message,
        },
      };

  return reply.status(statusCode).send(payload);
}

export function zodDetails(error: ZodError) {
  return error.flatten();
}
