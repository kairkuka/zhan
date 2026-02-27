-- AlterTable
ALTER TABLE "QuestionSkillTag" ADD COLUMN     "curriculumSkillId" TEXT,
ALTER COLUMN "skillId" DROP NOT NULL;

-- CreateIndex
CREATE INDEX "QuestionSkillTag_curriculumSkillId_idx" ON "QuestionSkillTag"("curriculumSkillId");

-- AddForeignKey
ALTER TABLE "QuestionSkillTag" ADD CONSTRAINT "QuestionSkillTag_curriculumSkillId_fkey" FOREIGN KEY ("curriculumSkillId") REFERENCES "CurriculumSkill"("id") ON DELETE SET NULL ON UPDATE CASCADE;
