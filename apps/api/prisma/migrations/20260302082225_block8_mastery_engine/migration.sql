-- CreateTable
CREATE TABLE "SkillMastery" (
    "id" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "curriculumSkillId" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "totalAttempts" INTEGER NOT NULL DEFAULT 0,
    "totalScore" INTEGER NOT NULL DEFAULT 0,
    "masteryLevel" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SkillMastery_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "SkillMastery_organizationId_idx" ON "SkillMastery"("organizationId");

-- CreateIndex
CREATE UNIQUE INDEX "SkillMastery_studentId_curriculumSkillId_key" ON "SkillMastery"("studentId", "curriculumSkillId");

-- AddForeignKey
ALTER TABLE "SkillMastery" ADD CONSTRAINT "SkillMastery_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "Student"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SkillMastery" ADD CONSTRAINT "SkillMastery_curriculumSkillId_fkey" FOREIGN KEY ("curriculumSkillId") REFERENCES "CurriculumSkill"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SkillMastery" ADD CONSTRAINT "SkillMastery_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
