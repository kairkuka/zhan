import { Role } from '@prisma/client';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';

import { sendApiError, zodDetails } from '../lib/apiError.js';
import { prisma } from '../lib/prisma.js';
import { requireAuth, requireRole } from '../plugins/authGuard.js';

const StudentParamsSchema = z.object({
  id: z.string().cuid(),
});

type RiskLevel = 'LOW' | 'MEDIUM' | 'HIGH' | 'UNKNOWN';

function getRiskLevel(masteryLevel: number): Exclude<RiskLevel, 'UNKNOWN'> {
  if (masteryLevel >= 0.8) {
    return 'LOW';
  }

  if (masteryLevel >= 0.5) {
    return 'MEDIUM';
  }

  return 'HIGH';
}

export async function registerProjectionRoutes(app: FastifyInstance) {
  app.get(
    '/students/:id/projection',
    { preHandler: [requireAuth, requireRole([Role.TEACHER, Role.ADMIN])] },
    async (request, reply) => {
      if (!request.auth) {
        return sendApiError(reply, 401, 'UNAUTHORIZED', 'Unauthorized');
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
          organizationId: request.auth.organizationId,
        },
        select: {
          id: true,
        },
      });

      if (!student) {
        return sendApiError(reply, 404, 'STUDENT_NOT_FOUND', 'Student not found');
      }

      const masteries = await prisma.skillMastery.findMany({
        where: {
          studentId: student.id,
          organizationId: request.auth.organizationId,
        },
        select: {
          masteryLevel: true,
        },
      });

      if (masteries.length === 0) {
        return reply.send({
          studentId: student.id,
          skillsTracked: 0,
          averageMastery: 0,
          riskLevel: 'UNKNOWN' as RiskLevel,
          highRiskSkills: 0,
          mediumRiskSkills: 0,
          lowRiskSkills: 0,
        });
      }

      let highRiskSkills = 0;
      let mediumRiskSkills = 0;
      let lowRiskSkills = 0;

      const masterySum = masteries.reduce((sum, mastery) => {
        const riskLevel = getRiskLevel(mastery.masteryLevel);

        if (riskLevel === 'HIGH') {
          highRiskSkills += 1;
        } else if (riskLevel === 'MEDIUM') {
          mediumRiskSkills += 1;
        } else {
          lowRiskSkills += 1;
        }

        return sum + mastery.masteryLevel;
      }, 0);

      const averageMastery = masterySum / masteries.length;
      const riskLevel: RiskLevel =
        highRiskSkills > 0 ? 'HIGH' : mediumRiskSkills > 0 ? 'MEDIUM' : 'LOW';

      return reply.send({
        studentId: student.id,
        skillsTracked: masteries.length,
        averageMastery,
        riskLevel,
        highRiskSkills,
        mediumRiskSkills,
        lowRiskSkills,
      });
    },
  );
}
