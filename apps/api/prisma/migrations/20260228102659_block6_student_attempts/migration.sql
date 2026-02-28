-- CreateEnum
CREATE TYPE "AttemptStatus" AS ENUM ('IN_PROGRESS', 'SUBMITTED');

-- CreateTable
CREATE TABLE "AssignmentAttempt" (
    "id" TEXT NOT NULL,
    "assignmentId" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "status" "AttemptStatus" NOT NULL DEFAULT 'IN_PROGRESS',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "submittedAt" TIMESTAMP(3),

    CONSTRAINT "AssignmentAttempt_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "QuestionAttempt" (
    "id" TEXT NOT NULL,
    "attemptId" TEXT NOT NULL,
    "questionId" TEXT NOT NULL,
    "answer" JSONB NOT NULL,
    "score" INTEGER,
    "feedback" TEXT,

    CONSTRAINT "QuestionAttempt_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AssignmentAttempt_organizationId_idx" ON "AssignmentAttempt"("organizationId");

-- CreateIndex
CREATE INDEX "AssignmentAttempt_assignmentId_idx" ON "AssignmentAttempt"("assignmentId");

-- CreateIndex
CREATE INDEX "AssignmentAttempt_studentId_idx" ON "AssignmentAttempt"("studentId");

-- CreateIndex
CREATE INDEX "AssignmentAttempt_status_idx" ON "AssignmentAttempt"("status");

-- CreateIndex
CREATE INDEX "QuestionAttempt_attemptId_idx" ON "QuestionAttempt"("attemptId");

-- CreateIndex
CREATE INDEX "QuestionAttempt_questionId_idx" ON "QuestionAttempt"("questionId");

-- CreateIndex
CREATE UNIQUE INDEX "QuestionAttempt_attemptId_questionId_key" ON "QuestionAttempt"("attemptId", "questionId");

-- AddForeignKey
ALTER TABLE "AssignmentAttempt" ADD CONSTRAINT "AssignmentAttempt_assignmentId_fkey" FOREIGN KEY ("assignmentId") REFERENCES "Assignment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AssignmentAttempt" ADD CONSTRAINT "AssignmentAttempt_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "Student"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AssignmentAttempt" ADD CONSTRAINT "AssignmentAttempt_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QuestionAttempt" ADD CONSTRAINT "QuestionAttempt_attemptId_fkey" FOREIGN KEY ("attemptId") REFERENCES "AssignmentAttempt"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QuestionAttempt" ADD CONSTRAINT "QuestionAttempt_questionId_fkey" FOREIGN KEY ("questionId") REFERENCES "Question"("id") ON DELETE CASCADE ON UPDATE CASCADE;
