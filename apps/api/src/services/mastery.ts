import { AttemptStatus, type Prisma } from '@prisma/client';

type MasteryDelta = {
  attempts: number;
  score: number;
};

export async function updateMastery(tx: Prisma.TransactionClient, attemptId: string): Promise<void> {
  const attempt = await tx.assignmentAttempt.findUnique({
    where: {
      id: attemptId,
    },
    select: {
      id: true,
      status: true,
      studentId: true,
      organizationId: true,
      questionAttempts: {
        select: {
          score: true,
          question: {
            select: {
              skillTags: {
                where: {
                  curriculumSkillId: {
                    not: null,
                  },
                },
                select: {
                  curriculumSkillId: true,
                },
              },
            },
          },
        },
      },
    },
  });

  if (!attempt || attempt.status !== AttemptStatus.SUBMITTED) {
    return;
  }

  const deltas = new Map<string, MasteryDelta>();

  for (const questionAttempt of attempt.questionAttempts) {
    const score = questionAttempt.score ?? 0;

    for (const skillTag of questionAttempt.question.skillTags) {
      if (!skillTag.curriculumSkillId) {
        continue;
      }

      const existing = deltas.get(skillTag.curriculumSkillId) ?? {
        attempts: 0,
        score: 0,
      };

      deltas.set(skillTag.curriculumSkillId, {
        attempts: existing.attempts + 1,
        score: existing.score + score,
      });
    }
  }

  for (const [curriculumSkillId, delta] of deltas.entries()) {
    const mastery = await tx.skillMastery.findUnique({
      where: {
        studentId_curriculumSkillId: {
          studentId: attempt.studentId,
          curriculumSkillId,
        },
      },
      select: {
        id: true,
        totalAttempts: true,
        totalScore: true,
      },
    });

    const totalAttempts = (mastery?.totalAttempts ?? 0) + delta.attempts;
    const totalScore = (mastery?.totalScore ?? 0) + delta.score;
    const masteryLevel = totalAttempts === 0 ? 0 : totalScore / totalAttempts;

    if (mastery) {
      await tx.skillMastery.update({
        where: {
          id: mastery.id,
        },
        data: {
          totalAttempts,
          totalScore,
          masteryLevel,
        },
      });
      continue;
    }

    await tx.skillMastery.create({
      data: {
        studentId: attempt.studentId,
        curriculumSkillId,
        organizationId: attempt.organizationId,
        totalAttempts,
        totalScore,
        masteryLevel,
      },
    });
  }
}
