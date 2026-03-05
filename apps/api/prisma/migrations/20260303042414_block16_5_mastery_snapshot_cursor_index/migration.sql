-- CreateIndex
CREATE INDEX "MasterySnapshot_studentId_organizationId_createdAt_id_idx" ON "MasterySnapshot"("studentId", "organizationId", "createdAt" DESC, "id" DESC);
