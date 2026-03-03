import { AttemptStatus, Role } from '@prisma/client';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { z } from 'zod';

import { sendApiError, zodDetails } from '../lib/apiError.js';
import { prisma } from '../lib/prisma.js';
import { requireAuth, requireRole } from '../plugins/authGuard.js';
import { evaluateAttempt } from '../services/evaluator.js';
import { computeMasteryTrend } from '../services/mastery-analytics.js';
import {
  isValidMasteryOverviewCursor,
  loadStudentSnapshotsPage,
  loadStudentSnapshotsWithCap,
} from '../services/mastery-overview.js';
import { aggregateMasteryTrend, type MasteryTrendBucket } from '../services/mastery-trend.js';
import { updateMastery } from '../services/mastery.js';

const AssignmentParamsSchema = z.object({
  id: z.string().cuid(),
});

const AttemptParamsSchema = z.object({
  id: z.string().cuid(),
});

const StudentParamsSchema = z.object({
  id: z.string().cuid(),
});

const MasteryHistoryParamsSchema = z.object({
  skillId: z.string().cuid(),
});

const StudentMasteryHistoryParamsSchema = z.object({
  id: z.string().cuid(),
  skillId: z.string().cuid(),
});

const MasteryProjectionParamsSchema = z.object({
  skillId: z.string().cuid(),
});

const StudentMasteryProjectionParamsSchema = z.object({
  id: z.string().cuid(),
  skillId: z.string().cuid(),
});

const MasteryOverviewQuerySchema = z.object({
  cursor: z.string().min(1).refine(isValidMasteryOverviewCursor, 'Invalid cursor').optional(),
  limit: z.coerce.number().int().min(1).max(500).optional(),
});

const MasteryTrendQuerySchema = z.object({
  from: z.string().datetime({ offset: true }).optional(),
  to: z.string().datetime({ offset: true }).optional(),
  bucket: z.enum(['day', 'week', 'month']).optional(),
});

const SaveAnswerBodySchema = z.object({
  questionId: z.string().cuid(),
  answer: z.any(),
});

type AttemptWithScores = {
  questionAttempts: Array<{
    score: number | null;
  }>;
};

function calculateTotalScore(attempt: AttemptWithScores): number {
  return attempt.questionAttempts.reduce((sum, item) => sum + (item.score ?? 0), 0);
}

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

async function getCurriculumSkillInOrg(skillId: string, organizationId: string) {
  return prisma.curriculumSkill.findFirst({
    where: {
      id: skillId,
      topic: {
        unit: {
          subject: {
            organizationId,
          },
        },
      },
    },
    select: { id: true },
  });
}

async function getMasteryHistoryForSkill(studentId: string, skillId: string, organizationId: string) {
  return prisma.masterySnapshot.findMany({
    where: {
      studentId,
      curriculumSkillId: skillId,
      organizationId,
    },
    orderBy: {
      createdAt: 'asc',
    },
    select: {
      masteryLevel: true,
      createdAt: true,
    },
  });
}

async function getCurrentMastery(studentId: string, skillId: string, organizationId: string) {
  const mastery = await prisma.skillMastery.findFirst({
    where: {
      studentId,
      curriculumSkillId: skillId,
      organizationId,
    },
    select: {
      masteryLevel: true,
    },
  });

  return mastery?.masteryLevel ?? 0;
}

export async function registerAttemptRoutes(app: FastifyInstance) {
  app.get(
    '/me/mastery',
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

      const skills = await prisma.skillMastery.findMany({
        where: {
          studentId,
          organizationId: auth.organizationId,
        },
        orderBy: {
          updatedAt: 'desc',
        },
        select: {
          curriculumSkillId: true,
          totalAttempts: true,
          totalScore: true,
          masteryLevel: true,
        },
      });

      return reply.send({ skills });
    },
  );

  app.get(
    '/students/:id/mastery',
    { preHandler: [requireAuth, requireRole([Role.TEACHER, Role.ADMIN])] },
    async (request, reply) => {
      const auth = getRequestAuth(request, reply);
      if (!auth) {
        return;
      }

      const parsedParams = StudentParamsSchema.safeParse(request.params);
      if (!parsedParams.success) {
        return sendApiError(
          reply,
          400,
          'VALIDATION_ERROR',
          'Invalid student id',
          zodDetails(parsedParams.error),
        );
      }

      const student = await prisma.student.findFirst({
        where: {
          id: parsedParams.data.id,
          organizationId: auth.organizationId,
        },
        select: {
          id: true,
        },
      });

      if (!student) {
        return sendApiError(reply, 404, 'STUDENT_NOT_FOUND', 'Student not found');
      }

      const skills = await prisma.skillMastery.findMany({
        where: {
          studentId: student.id,
          organizationId: auth.organizationId,
        },
        orderBy: {
          updatedAt: 'desc',
        },
        select: {
          curriculumSkillId: true,
          totalAttempts: true,
          totalScore: true,
          masteryLevel: true,
        },
      });

      return reply.send({ skills });
    },
  );

  app.get(
    '/me/mastery/:skillId/history',
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

      const parsedParams = MasteryHistoryParamsSchema.safeParse(request.params);
      if (!parsedParams.success) {
        return sendApiError(
          reply,
          400,
          'VALIDATION_ERROR',
          'Invalid skill id',
          zodDetails(parsedParams.error),
        );
      }

      const skill = await getCurriculumSkillInOrg(parsedParams.data.skillId, auth.organizationId);

      if (!skill) {
        return sendApiError(reply, 404, 'SKILL_NOT_FOUND', 'Curriculum skill not found');
      }

      const history = await getMasteryHistoryForSkill(studentId, skill.id, auth.organizationId);

      return reply.send({ history });
    },
  );

  app.get(
    '/students/:id/mastery/:skillId/history',
    { preHandler: [requireAuth, requireRole([Role.TEACHER, Role.ADMIN])] },
    async (request, reply) => {
      const auth = getRequestAuth(request, reply);
      if (!auth) {
        return;
      }

      const parsedParams = StudentMasteryHistoryParamsSchema.safeParse(request.params);
      if (!parsedParams.success) {
        return sendApiError(
          reply,
          400,
          'VALIDATION_ERROR',
          'Invalid params',
          zodDetails(parsedParams.error),
        );
      }

      const student = await prisma.student.findFirst({
        where: {
          id: parsedParams.data.id,
          organizationId: auth.organizationId,
        },
        select: {
          id: true,
        },
      });

      if (!student) {
        return sendApiError(reply, 404, 'STUDENT_NOT_FOUND', 'Student not found');
      }

      const skill = await getCurriculumSkillInOrg(parsedParams.data.skillId, auth.organizationId);

      if (!skill) {
        return sendApiError(reply, 404, 'SKILL_NOT_FOUND', 'Curriculum skill not found');
      }

      const history = await getMasteryHistoryForSkill(student.id, skill.id, auth.organizationId);

      return reply.send({ history });
    },
  );

  app.get(
    '/me/mastery/:skillId/projection',
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

      const parsedParams = MasteryProjectionParamsSchema.safeParse(request.params);
      if (!parsedParams.success) {
        return sendApiError(
          reply,
          400,
          'VALIDATION_ERROR',
          'Invalid skill id',
          zodDetails(parsedParams.error),
        );
      }

      const skill = await getCurriculumSkillInOrg(parsedParams.data.skillId, auth.organizationId);
      if (!skill) {
        return sendApiError(reply, 404, 'SKILL_NOT_FOUND', 'Curriculum skill not found');
      }

      const [history, currentMastery] = await Promise.all([
        getMasteryHistoryForSkill(studentId, skill.id, auth.organizationId),
        getCurrentMastery(studentId, skill.id, auth.organizationId),
      ]);

      const analytics = computeMasteryTrend(history);

      return reply.send({
        currentMastery,
        trend: analytics.trend,
        velocity: analytics.velocity,
        risk: analytics.risk,
      });
    },
  );

  app.get(
    '/students/:id/mastery/:skillId/projection',
    { preHandler: [requireAuth, requireRole([Role.TEACHER, Role.ADMIN])] },
    async (request, reply) => {
      const auth = getRequestAuth(request, reply);
      if (!auth) {
        return;
      }

      const parsedParams = StudentMasteryProjectionParamsSchema.safeParse(request.params);
      if (!parsedParams.success) {
        return sendApiError(
          reply,
          400,
          'VALIDATION_ERROR',
          'Invalid params',
          zodDetails(parsedParams.error),
        );
      }

      const student = await prisma.student.findFirst({
        where: {
          id: parsedParams.data.id,
          organizationId: auth.organizationId,
        },
        select: {
          id: true,
        },
      });

      if (!student) {
        return sendApiError(reply, 404, 'STUDENT_NOT_FOUND', 'Student not found');
      }

      const skill = await getCurriculumSkillInOrg(parsedParams.data.skillId, auth.organizationId);
      if (!skill) {
        return sendApiError(reply, 404, 'SKILL_NOT_FOUND', 'Curriculum skill not found');
      }

      const [history, currentMastery] = await Promise.all([
        getMasteryHistoryForSkill(student.id, skill.id, auth.organizationId),
        getCurrentMastery(student.id, skill.id, auth.organizationId),
      ]);

      const analytics = computeMasteryTrend(history);

      return reply.send({
        currentMastery,
        trend: analytics.trend,
        velocity: analytics.velocity,
        risk: analytics.risk,
      });
    },
  );

  app.get(
    '/students/:id/mastery-trend',
    { preHandler: [requireAuth, requireRole([Role.TEACHER, Role.ADMIN])] },
    async (request, reply) => {
      const auth = getRequestAuth(request, reply);
      if (!auth) {
        return;
      }

      const parsedParams = StudentParamsSchema.safeParse(request.params);
      if (!parsedParams.success) {
        return sendApiError(
          reply,
          400,
          'VALIDATION_ERROR',
          'Invalid student id',
          zodDetails(parsedParams.error),
        );
      }

      const parsedQuery = MasteryTrendQuerySchema.safeParse(request.query);
      if (!parsedQuery.success) {
        return sendApiError(
          reply,
          400,
          'VALIDATION_ERROR',
          'Invalid mastery trend query',
          zodDetails(parsedQuery.error),
        );
      }

      const fromDate = parsedQuery.data.from ? new Date(parsedQuery.data.from) : undefined;
      const toDate = parsedQuery.data.to ? new Date(parsedQuery.data.to) : undefined;

      if (fromDate && toDate && fromDate > toDate) {
        return sendApiError(reply, 400, 'VALIDATION_ERROR', '"from" must be less than or equal to "to"');
      }

      const student = await prisma.student.findFirst({
        where: {
          id: parsedParams.data.id,
          organizationId: auth.organizationId,
        },
        select: {
          id: true,
        },
      });

      if (!student) {
        return sendApiError(reply, 404, 'STUDENT_NOT_FOUND', 'Student not found');
      }

      const createdAtFilter: {
        gte?: Date;
        lte?: Date;
      } = {};

      if (fromDate) {
        createdAtFilter.gte = fromDate;
      }

      if (toDate) {
        createdAtFilter.lte = toDate;
      }

      const snapshots = await prisma.masterySnapshot.findMany({
        where: {
          studentId: student.id,
          organizationId: auth.organizationId,
          ...(fromDate || toDate ? { createdAt: createdAtFilter } : {}),
        },
        orderBy: {
          createdAt: 'asc',
        },
        select: {
          curriculumSkillId: true,
          masteryLevel: true,
          createdAt: true,
        },
      });

      const bucket = (parsedQuery.data.bucket ?? 'week') as MasteryTrendBucket;
      const buckets = aggregateMasteryTrend(snapshots, bucket);

      return reply.send({ buckets });
    },
  );

  app.get(
    '/students/:id/mastery-overview',
    { preHandler: [requireAuth, requireRole([Role.TEACHER, Role.ADMIN])] },
    async (request, reply) => {
      const auth = getRequestAuth(request, reply);
      if (!auth) {
        return;
      }

      const parsedParams = StudentParamsSchema.safeParse(request.params);
      if (!parsedParams.success) {
        return sendApiError(
          reply,
          400,
          'VALIDATION_ERROR',
          'Invalid student id',
          zodDetails(parsedParams.error),
        );
      }

      const student = await prisma.student.findFirst({
        where: {
          id: parsedParams.data.id,
          organizationId: auth.organizationId,
        },
        select: {
          id: true,
        },
      });

      if (!student) {
        return sendApiError(reply, 404, 'STUDENT_NOT_FOUND', 'Student not found');
      }

      const parsedQuery = MasteryOverviewQuerySchema.safeParse(request.query);
      if (!parsedQuery.success) {
        return sendApiError(
          reply,
          400,
          'VALIDATION_ERROR',
          'Invalid pagination query',
          zodDetails(parsedQuery.error),
        );
      }

      const isPaginationUsed =
        parsedQuery.data.cursor !== undefined || parsedQuery.data.limit !== undefined;
      const paginationLimit = parsedQuery.data.limit ?? 200;
      const paginationCursor = parsedQuery.data.cursor;

      const [masteries, snapshotData] = await Promise.all([
        prisma.skillMastery.findMany({
          where: {
            studentId: student.id,
            organizationId: auth.organizationId,
          },
          orderBy: {
            updatedAt: 'desc',
          },
          select: {
            curriculumSkillId: true,
            masteryLevel: true,
          },
        }),
        isPaginationUsed
          ? loadStudentSnapshotsPage(
              student.id,
              auth.organizationId,
              paginationCursor,
              paginationLimit,
            )
          : loadStudentSnapshotsWithCap(student.id, auth.organizationId).then((snapshots) => ({
              snapshots,
              nextCursor: null,
            })),
      ]);

      const historyBySkill = new Map<string, Array<{ masteryLevel: number; createdAt: Date }>>();
      for (const snapshot of snapshotData.snapshots) {
        const existing = historyBySkill.get(snapshot.curriculumSkillId) ?? [];
        existing.push({
          masteryLevel: snapshot.masteryLevel,
          createdAt: snapshot.createdAt,
        });
        historyBySkill.set(snapshot.curriculumSkillId, existing);
      }

      const skills = masteries.map((mastery) => {
        const analytics = computeMasteryTrend(historyBySkill.get(mastery.curriculumSkillId) ?? []);
        return {
          skillId: mastery.curriculumSkillId,
          currentMastery: mastery.masteryLevel,
          trend: analytics.trend,
          risk: analytics.risk,
        };
      });

      if (isPaginationUsed) {
        return reply.send({
          skills,
          nextCursor: snapshotData.nextCursor,
        });
      }

      return reply.send({ skills });
    },
  );

  app.get(
    '/me/attempts',
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

      const attempts = await prisma.assignmentAttempt.findMany({
        where: {
          organizationId: auth.organizationId,
          studentId,
        },
        orderBy: {
          createdAt: 'desc',
        },
        select: {
          id: true,
          assignmentId: true,
          status: true,
          createdAt: true,
          submittedAt: true,
          questionAttempts: {
            select: {
              score: true,
            },
          },
        },
      });

      return reply.send({
        attempts: attempts.map((attempt) => ({
          attemptId: attempt.id,
          assignmentId: attempt.assignmentId,
          status: attempt.status,
          createdAt: attempt.createdAt,
          submittedAt: attempt.submittedAt,
          totalScore: calculateTotalScore(attempt),
        })),
      });
    },
  );

  app.get(
    '/attempts/:id',
    { preHandler: [requireAuth, requireRole([Role.STUDENT, Role.TEACHER, Role.ADMIN])] },
    async (request, reply) => {
      const auth = getRequestAuth(request, reply);
      if (!auth) {
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

      const attempt = await prisma.assignmentAttempt.findFirst({
        where: {
          id: parsedParams.data.id,
          organizationId: auth.organizationId,
        },
        select: {
          id: true,
          assignmentId: true,
          studentId: true,
          status: true,
          createdAt: true,
          submittedAt: true,
          questionAttempts: {
            orderBy: {
              id: 'asc',
            },
            select: {
              questionId: true,
              score: true,
              feedback: true,
            },
          },
        },
      });

      if (!attempt) {
        return sendApiError(reply, 404, 'ATTEMPT_NOT_FOUND', 'Attempt not found');
      }

      if (auth.role === Role.STUDENT) {
        const studentId = await getStudentIdForAuth(request, reply);
        if (!studentId) {
          return;
        }

        if (attempt.studentId !== studentId) {
          return sendApiError(reply, 403, 'FORBIDDEN', 'Attempt does not belong to current student');
        }
      }

      return reply.send({
        attemptId: attempt.id,
        assignmentId: attempt.assignmentId,
        studentId: attempt.studentId,
        status: attempt.status,
        createdAt: attempt.createdAt,
        submittedAt: attempt.submittedAt,
        totalScore: calculateTotalScore(attempt),
        questionAttempts: attempt.questionAttempts.map((item) => ({
          questionId: item.questionId,
          score: item.score,
          feedback: item.feedback,
        })),
      });
    },
  );

  app.get(
    '/assignments/:id/attempts',
    { preHandler: [requireAuth, requireRole([Role.TEACHER, Role.ADMIN])] },
    async (request, reply) => {
      const auth = getRequestAuth(request, reply);
      if (!auth) {
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

      const attempts = await prisma.assignmentAttempt.findMany({
        where: {
          assignmentId: assignment.id,
          organizationId: auth.organizationId,
        },
        orderBy: {
          createdAt: 'desc',
        },
        select: {
          id: true,
          studentId: true,
          status: true,
          submittedAt: true,
          questionAttempts: {
            select: {
              score: true,
            },
          },
        },
      });

      const normalizedAttempts = attempts.map((attempt) => ({
        attemptId: attempt.id,
        studentId: attempt.studentId,
        status: attempt.status,
        totalScore: calculateTotalScore(attempt),
        submittedAt: attempt.submittedAt,
      }));

      const submittedAttempts = normalizedAttempts.filter((attempt) => attempt.status === AttemptStatus.SUBMITTED);
      const submittedScoreSum = submittedAttempts.reduce((sum, attempt) => sum + attempt.totalScore, 0);
      const avgScore = submittedAttempts.length === 0 ? 0 : submittedScoreSum / submittedAttempts.length;

      return reply.send({
        summary: {
          totalAttempts: normalizedAttempts.length,
          submitted: submittedAttempts.length,
          avgScore,
        },
        attempts: normalizedAttempts,
      });
    },
  );

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
        await updateMastery(tx, attempt.id);

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
