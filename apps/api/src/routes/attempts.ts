import { AttemptStatus, Role } from '@prisma/client';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { z } from 'zod';

import { sendApiError, zodDetails } from '../lib/apiError.js';
import { prisma } from '../lib/prisma.js';
import { requireAuth, requireRole } from '../plugins/authGuard.js';
import { evaluateAttempt } from '../services/evaluator.js';

const AssignmentParamsSchema = z.object({
  id: z.string().cuid(),
});

const AttemptParamsSchema = z.object({
  id: z.string().cuid(),
});

const SaveAnswerBodySchema = z.object({
  questionId: z.string().cuid(),
  answer: z.any(),
});

function getRequestAuth(request: FastifyRequest, reply: FastifyReply) {
  if (!request.auth) {
    void sendApiError(reply, 401, 'UNAUTHORIZED', 'Unauthorized');
    return null;
  }

  return request.auth;
}

async function getStudentIdForAuth(request: FastifyRequest, reply: FastifyReply) {
  const auth = getRequestAuth(request, reply);
  if (!auth) {
    return null;
  }

  const student = await prisma.student.findFirst({
    where: {
      userId: auth.userId,
      organizationId: auth.organizationId,
    },
    select: {
      id: true,
    },
  });

  if (!student) {
    void sendApiError(reply, 403, 'FORBIDDEN', 'Student profile not found');
    return null;
  }

  return student.id;
}

export async function registerAttemptRoutes(app: FastifyInstance) {
  app.post(
    '/assignments/:id/start',
    { preHandler: [requireAuth, requireRole([Role.STUDENT])] },
    async (request, reply) => {
      const auth = getRequestAuth(request, reply);
      if (!auth) {
        return;
      }

      const studentId = await getStudentIdForAuth(request, reply);
      if (!studentId) {
        return;
      }

      const parsedParams = AssignmentParamsSchema.safeParse(request.params);
      if (!parsedParams.success) {
        return sendApiError(
          reply,
          400,
          'VALIDATION_ERROR',
          'Invalid assignment id',
          zodDetails(parsedParams.error),
        );
      }

      const assignment = await prisma.assignment.findFirst({
        where: {
          id: parsedParams.data.id,
          organizationId: auth.organizationId,
        },
        select: {
          id: true,
        },
      });

      if (!assignment) {
        return sendApiError(reply, 404, 'ASSIGNMENT_NOT_FOUND', 'Assignment not found');
      }

      const attempt = await prisma.assignmentAttempt.create({
        data: {
          assignmentId: assignment.id,
          studentId,
          organizationId: auth.organizationId,
        },
        select: {
          id: true,
        },
      });

      return reply.status(201).send({
        attemptId: attempt.id,
      });
    },
  );

  app.post(
    '/attempts/:id/answer',
    { preHandler: [requireAuth, requireRole([Role.STUDENT])] },
    async (request, reply) => {
      const auth = getRequestAuth(request, reply);
      if (!auth) {
        return;
      }

      const studentId = await getStudentIdForAuth(request, reply);
      if (!studentId) {
        return;
      }

      const parsedParams = AttemptParamsSchema.safeParse(request.params);
      if (!parsedParams.success) {
        return sendApiError(
          reply,
          400,
          'VALIDATION_ERROR',
          'Invalid attempt id',
          zodDetails(parsedParams.error),
        );
      }

      const parsedBody = SaveAnswerBodySchema.safeParse(request.body);
      if (!parsedBody.success) {
        return sendApiError(
          reply,
          400,
          'VALIDATION_ERROR',
          'Invalid answer payload',
          zodDetails(parsedBody.error),
        );
      }

      const attempt = await prisma.assignmentAttempt.findUnique({
        where: {
          id: parsedParams.data.id,
        },
        select: {
          id: true,
          assignmentId: true,
          studentId: true,
          organizationId: true,
          status: true,
        },
      });

      if (!attempt) {
        return sendApiError(reply, 404, 'ATTEMPT_NOT_FOUND', 'Attempt not found');
      }

      if (attempt.organizationId !== auth.organizationId) {
        return sendApiError(reply, 403, 'FORBIDDEN', 'Cross-organization access denied');
      }

      if (attempt.studentId !== studentId) {
        return sendApiError(reply, 403, 'FORBIDDEN', 'Attempt does not belong to current student');
      }

      if (attempt.status !== AttemptStatus.IN_PROGRESS) {
        return sendApiError(reply, 400, 'INVALID_ATTEMPT_STATUS', 'Attempt is not in progress');
      }

      const question = await prisma.question.findFirst({
        where: {
          id: parsedBody.data.questionId,
          assignmentId: attempt.assignmentId,
          organizationId: auth.organizationId,
        },
        select: { id: true },
      });

      if (!question) {
        return sendApiError(reply, 400, 'INVALID_RELATION', 'Question does not belong to this assignment');
      }

      const questionAttempt = await prisma.questionAttempt.upsert({
        where: {
          attemptId_questionId: {
            attemptId: attempt.id,
            questionId: question.id,
          },
        },
        update: {
          answer: parsedBody.data.answer,
          score: null,
          feedback: null,
        },
        create: {
          attemptId: attempt.id,
          questionId: question.id,
          answer: parsedBody.data.answer,
        },
        select: {
          id: true,
          attemptId: true,
          questionId: true,
          score: true,
          feedback: true,
        },
      });

      return reply.send({
        questionAttempt,
      });
    },
  );

  app.post(
    '/attempts/:id/submit',
    { preHandler: [requireAuth, requireRole([Role.STUDENT])] },
    async (request, reply) => {
      const auth = getRequestAuth(request, reply);
      if (!auth) {
        return;
      }

      const studentId = await getStudentIdForAuth(request, reply);
      if (!studentId) {
        return;
      }

      const parsedParams = AttemptParamsSchema.safeParse(request.params);
      if (!parsedParams.success) {
        return sendApiError(
          reply,
          400,
          'VALIDATION_ERROR',
          'Invalid attempt id',
          zodDetails(parsedParams.error),
        );
      }

      const attempt = await prisma.assignmentAttempt.findUnique({
        where: {
          id: parsedParams.data.id,
        },
        select: {
          id: true,
          studentId: true,
          organizationId: true,
          status: true,
        },
      });

      if (!attempt) {
        return sendApiError(reply, 404, 'ATTEMPT_NOT_FOUND', 'Attempt not found');
      }

      if (attempt.organizationId !== auth.organizationId) {
        return sendApiError(reply, 403, 'FORBIDDEN', 'Cross-organization access denied');
      }

      if (attempt.studentId !== studentId) {
        return sendApiError(reply, 403, 'FORBIDDEN', 'Attempt does not belong to current student');
      }

      if (attempt.status !== AttemptStatus.IN_PROGRESS) {
        return sendApiError(reply, 400, 'INVALID_ATTEMPT_STATUS', 'Attempt is not in progress');
      }

      const result = await prisma.$transaction(async (tx) => {
        const updatedAttempt = await tx.assignmentAttempt.update({
          where: {
            id: attempt.id,
          },
          data: {
            status: AttemptStatus.SUBMITTED,
            submittedAt: new Date(),
          },
          select: {
            id: true,
            status: true,
            submittedAt: true,
          },
        });

        const evaluation = await evaluateAttempt(tx, attempt.id);

        return {
          updatedAttempt,
          evaluation,
        };
      });

      return reply.send({
        attemptId: result.updatedAttempt.id,
        status: result.updatedAttempt.status,
        submittedAt: result.updatedAttempt.submittedAt,
        totalScore: result.evaluation.totalScore,
        questionAttempts: result.evaluation.questionAttempts,
      });
    },
  );
}
