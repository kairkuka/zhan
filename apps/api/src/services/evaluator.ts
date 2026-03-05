import { QuestionType, type Prisma } from '@prisma/client';

type EvaluatedQuestionAttempt = {
  id: string;
  questionId: string;
  score: number;
  feedback: string | null;
};

function evaluateQuestionByType(type: QuestionType): { score: number; feedback: string | null } {
  if (type === QuestionType.MCQ) {
    return {
      score: 1,
      feedback: null,
    };
  }

  return {
    score: 0,
    feedback: 'AI evaluation pending',
  };
}

export async function evaluateAttempt(
  tx: Prisma.TransactionClient,
  attemptId: string,
): Promise<{ questionAttempts: EvaluatedQuestionAttempt[]; totalScore: number }> {
  const questionAttempts = await tx.questionAttempt.findMany({
    where: { attemptId },
    orderBy: { id: 'asc' },
    select: {
      id: true,
      questionId: true,
      question: {
        select: {
          type: true,
        },
      },
    },
  });

  const evaluated = await Promise.all(
    questionAttempts.map(async (questionAttempt) => {
      const result = evaluateQuestionByType(questionAttempt.question.type);

      return tx.questionAttempt.update({
        where: { id: questionAttempt.id },
        data: {
          score: result.score,
          feedback: result.feedback,
        },
        select: {
          id: true,
          questionId: true,
          score: true,
          feedback: true,
        },
      });
    }),
  );

  const normalized = evaluated.map((item) => ({
    id: item.id,
    questionId: item.questionId,
    score: item.score ?? 0,
    feedback: item.feedback,
  }));

  const totalScore = normalized.reduce((sum, item) => sum + item.score, 0);

  return {
    questionAttempts: normalized,
    totalScore,
  };
}
