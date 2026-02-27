#!/usr/bin/env bash
set -euo pipefail

BASE_URL="${API_BASE_URL:-http://localhost:4000}"
ADMIN_EMAIL="${ADMIN_EMAIL:-admin@demo.local}"
ADMIN_PASSWORD="${ADMIN_PASSWORD:-demo12345}"

login_response=$(curl -sS -X POST "$BASE_URL/auth/login" \
  -H 'Content-Type: application/json' \
  -d "{\"email\":\"$ADMIN_EMAIL\",\"password\":\"$ADMIN_PASSWORD\"}")

token=$(printf '%s' "$login_response" | node -e '
let data = "";
process.stdin.on("data", (chunk) => { data += chunk; });
process.stdin.on("end", () => {
  const parsed = JSON.parse(data);
  if (!parsed.token) {
    console.error("Missing token in login response");
    process.exit(1);
  }
  process.stdout.write(parsed.token);
});
')

echo "TOKEN_OK"

skills_response=$(curl -sS "$BASE_URL/curriculum/skills" -H "Authorization: Bearer $token")
curriculum_skill_id=$(printf '%s' "$skills_response" | node -e '
let data = "";
process.stdin.on("data", (chunk) => { data += chunk; });
process.stdin.on("end", () => {
  const parsed = JSON.parse(data);
  const first = parsed.skills?.[0];
  if (!first?.id) {
    console.error("No curriculum skills found");
    process.exit(1);
  }
  process.stdout.write(first.id);
});
')

echo "CURR_SKILL_ID=$curriculum_skill_id"

questions_response=$(curl -sS "$BASE_URL/questions?curriculumSkillId=$curriculum_skill_id" \
  -H "Authorization: Bearer $token")
questions_stats=$(printf '%s' "$questions_response" | node -e '
let data = "";
process.stdin.on("data", (chunk) => { data += chunk; });
process.stdin.on("end", () => {
  const parsed = JSON.parse(data);
  const questions = parsed.questions ?? [];
  if (questions.length === 0) {
    console.error("No questions found for curriculum skill");
    process.exit(1);
  }
  const assignmentId = questions[0]?.assignmentId;
  if (!assignmentId) {
    console.error("No assignmentId on filtered question");
    process.exit(1);
  }
  process.stdout.write(`${questions.length}\n${assignmentId}`);
});
')

questions_count=$(printf '%s' "$questions_stats" | sed -n '1p')
assignment_id=$(printf '%s' "$questions_stats" | sed -n '2p')

echo "QUESTIONS_FILTER_OK $questions_count"
echo "ASSIGNMENT_ID=$assignment_id"

assignment_response=$(curl -sS "$BASE_URL/assignments/$assignment_id" \
  -H "Authorization: Bearer $token")
printf '%s' "$assignment_response" | node -e '
let data = "";
process.stdin.on("data", (chunk) => { data += chunk; });
process.stdin.on("end", () => {
  const assignment = JSON.parse(data);
  if (!Array.isArray(assignment.questions) || assignment.questions.length === 0) {
    console.error("No questions in assignment response");
    process.exit(1);
  }
  const hasCurriculumTag = assignment.questions.some((question) =>
    (question.skillTags ?? []).some(
      (tag) => tag.curriculumSkillId && tag.curriculumSkill && tag.curriculumSkill.id,
    ),
  );

  if (!hasCurriculumTag) {
    console.error("No curriculum tags with nested skill info");
    process.exit(1);
  }

  process.stdout.write("ASSIGNMENT_OK");
});
'

echo
