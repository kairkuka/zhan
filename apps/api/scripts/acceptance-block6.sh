#!/usr/bin/env bash
set -euo pipefail

BASE_URL="${API_BASE_URL:-http://localhost:4000}"
STUDENT_EMAIL="${STUDENT_EMAIL:-student@demo.local}"
STUDENT_PASSWORD="${STUDENT_PASSWORD:-demo12345}"
ADMIN_EMAIL="${ADMIN_EMAIL:-admin@demo.local}"
ADMIN_PASSWORD="${ADMIN_PASSWORD:-demo12345}"

student_login=$(curl -sS -X POST "$BASE_URL/auth/login" \
  -H 'Content-Type: application/json' \
  -d "{\"email\":\"$STUDENT_EMAIL\",\"password\":\"$STUDENT_PASSWORD\"}")

student_token=$(printf '%s' "$student_login" | node -e '
let data = "";
process.stdin.on("data", (chunk) => { data += chunk; });
process.stdin.on("end", () => {
  const parsed = JSON.parse(data);
  if (!parsed.token) {
    console.error("Student login failed");
    process.exit(1);
  }
  process.stdout.write(parsed.token);
});
')

echo "STUDENT_TOKEN_OK"

admin_login=$(curl -sS -X POST "$BASE_URL/auth/login" \
  -H 'Content-Type: application/json' \
  -d "{\"email\":\"$ADMIN_EMAIL\",\"password\":\"$ADMIN_PASSWORD\"}")

admin_token=$(printf '%s' "$admin_login" | node -e '
let data = "";
process.stdin.on("data", (chunk) => { data += chunk; });
process.stdin.on("end", () => {
  const parsed = JSON.parse(data);
  if (!parsed.token) {
    console.error("Admin login failed");
    process.exit(1);
  }
  process.stdout.write(parsed.token);
});
')

skills_response=$(curl -sS "$BASE_URL/curriculum/skills" \
  -H "Authorization: Bearer $student_token")

curriculum_skill_id=$(printf '%s' "$skills_response" | node -e '
let data = "";
process.stdin.on("data", (chunk) => { data += chunk; });
process.stdin.on("end", () => {
  const parsed = JSON.parse(data);
  const skill = parsed.skills?.[0];
  if (!skill?.id) {
    console.error("No curriculum skills found");
    process.exit(1);
  }
  process.stdout.write(skill.id);
});
')

question_stats=$(curl -sS "$BASE_URL/questions?curriculumSkillId=$curriculum_skill_id&limit=1" \
  -H "Authorization: Bearer $admin_token" | node -e '
let data = "";
process.stdin.on("data", (chunk) => { data += chunk; });
process.stdin.on("end", () => {
  const parsed = JSON.parse(data);
  const question = parsed.questions?.[0];
  if (!question?.assignmentId || !question?.id) {
    console.error("No seeded question for curriculum skill");
    process.exit(1);
  }
  process.stdout.write(`${question.assignmentId}\n${question.id}`);
});
')

assignment_id=$(printf '%s' "$question_stats" | sed -n '1p')
question_id=$(printf '%s' "$question_stats" | sed -n '2p')

echo "ASSIGNMENT_ID=$assignment_id"
echo "QUESTION_ID=$question_id"

start_response=$(curl -sS -X POST "$BASE_URL/assignments/$assignment_id/start" \
  -H "Authorization: Bearer $student_token")

attempt_id=$(printf '%s' "$start_response" | node -e '
let data = "";
process.stdin.on("data", (chunk) => { data += chunk; });
process.stdin.on("end", () => {
  const parsed = JSON.parse(data);
  if (!parsed.attemptId) {
    console.error("Failed to start attempt");
    process.exit(1);
  }
  process.stdout.write(parsed.attemptId);
});
')

echo "ATTEMPT_STARTED=$attempt_id"

answer_response=$(curl -sS -X POST "$BASE_URL/attempts/$attempt_id/answer" \
  -H "Authorization: Bearer $student_token" \
  -H 'Content-Type: application/json' \
  -d "{\"questionId\":\"$question_id\",\"answer\":{\"choice\":\"A\"}}")

printf '%s' "$answer_response" | node -e '
let data = "";
process.stdin.on("data", (chunk) => { data += chunk; });
process.stdin.on("end", () => {
  const parsed = JSON.parse(data);
  if (!parsed.questionAttempt?.id) {
    console.error("Failed to save question answer");
    process.exit(1);
  }
  process.stdout.write("ANSWER_SAVED");
});
'
echo

submit_response=$(curl -sS -X POST "$BASE_URL/attempts/$attempt_id/submit" \
  -H "Authorization: Bearer $student_token")

printf '%s' "$submit_response" | node -e '
let data = "";
process.stdin.on("data", (chunk) => { data += chunk; });
process.stdin.on("end", () => {
  const parsed = JSON.parse(data);
  if (parsed.status !== "SUBMITTED") {
    console.error("Attempt status is not SUBMITTED");
    process.exit(1);
  }
  const attempts = parsed.questionAttempts ?? [];
  if (!Array.isArray(attempts) || attempts.length === 0) {
    console.error("No questionAttempts in submit response");
    process.exit(1);
  }
  const hasScore = attempts.some((item) => typeof item.score === "number");
  if (!hasScore) {
    console.error("No score in evaluated questionAttempts");
    process.exit(1);
  }
  process.stdout.write("ATTEMPT_SUBMITTED_OK");
});
'
echo
