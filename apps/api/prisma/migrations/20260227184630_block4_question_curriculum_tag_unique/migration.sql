-- Deduplicate existing curriculum question tags before adding unique key.
WITH ranked AS (
  SELECT
    "id",
    ROW_NUMBER() OVER (
      PARTITION BY "questionId", "curriculumSkillId"
      ORDER BY "id"
    ) AS rn
  FROM "QuestionSkillTag"
  WHERE "curriculumSkillId" IS NOT NULL
)
DELETE FROM "QuestionSkillTag" q
USING ranked r
WHERE q."id" = r."id"
  AND r.rn > 1;

-- Idempotency + race-safety key for curriculum tags.
CREATE UNIQUE INDEX "QuestionSkillTag_questionId_curriculumSkillId_key"
ON "QuestionSkillTag"("questionId", "curriculumSkillId");
