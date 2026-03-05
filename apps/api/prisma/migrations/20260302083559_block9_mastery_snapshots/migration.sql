/*
  Warnings:

  - You are about to drop the column `confidence` on the `MasterySnapshot` table. All the data in the column will be lost.
  - You are about to drop the column `mastery` on the `MasterySnapshot` table. All the data in the column will be lost.
  - You are about to drop the column `skillId` on the `MasterySnapshot` table. All the data in the column will be lost.
  - You are about to drop the column `updatedAt` on the `MasterySnapshot` table. All the data in the column will be lost.
  - Added the required column `curriculumSkillId` to the `MasterySnapshot` table without a default value. This is not possible if the table is not empty.
  - Added the required column `masteryLevel` to the `MasterySnapshot` table without a default value. This is not possible if the table is not empty.
  - Added the required column `totalAttempts` to the `MasterySnapshot` table without a default value. This is not possible if the table is not empty.
  - Added the required column `totalScore` to the `MasterySnapshot` table without a default value. This is not possible if the table is not empty.

*/
-- DropForeignKey
ALTER TABLE "MasterySnapshot" DROP CONSTRAINT "MasterySnapshot_skillId_fkey";

-- DropIndex
DROP INDEX "MasterySnapshot_skillId_idx";

-- DropIndex
DROP INDEX "MasterySnapshot_studentId_idx";

-- DropIndex
DROP INDEX "MasterySnapshot_studentId_skillId_key";

-- AlterTable
ALTER TABLE "MasterySnapshot" DROP COLUMN "confidence",
DROP COLUMN "mastery",
DROP COLUMN "skillId",
DROP COLUMN "updatedAt",
ADD COLUMN     "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "curriculumSkillId" TEXT NOT NULL,
ADD COLUMN     "masteryLevel" DOUBLE PRECISION NOT NULL,
ADD COLUMN     "totalAttempts" INTEGER NOT NULL,
ADD COLUMN     "totalScore" INTEGER NOT NULL;

-- CreateIndex
CREATE INDEX "MasterySnapshot_studentId_curriculumSkillId_idx" ON "MasterySnapshot"("studentId", "curriculumSkillId");

-- CreateIndex
CREATE INDEX "MasterySnapshot_createdAt_idx" ON "MasterySnapshot"("createdAt");

-- AddForeignKey
ALTER TABLE "MasterySnapshot" ADD CONSTRAINT "MasterySnapshot_curriculumSkillId_fkey" FOREIGN KEY ("curriculumSkillId") REFERENCES "CurriculumSkill"("id") ON DELETE CASCADE ON UPDATE CASCADE;
