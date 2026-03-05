#!/usr/bin/env bash
set -euo pipefail

BASE_URL="${API_BASE_URL:-http://localhost:4000}"
STUDENT_EMAIL="${STUDENT_EMAIL:-student@demo.local}"
STUDENT_PASSWORD="${STUDENT_PASSWORD:-demo12345}"
TEACHER_EMAIL="${TEACHER_EMAIL:-teacher@demo.local}"
TEACHER_PASSWORD="${TEACHER_PASSWORD:-demo12345}"
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

assignment_id="${ASSIGNMENT_ID:-}"
question_id="${QUESTION_ID:-}"

if [[ -z "$assignment_id" || -z "$question_id" ]]; then
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

  question_stats=$(curl -sS "$BASE_URL/questions?limit=1" \
    -H "Authorization: Bearer $admin_token" | node -e '
let data = "";
process.stdin.on("data", (chunk) => { data += chunk; });
process.stdin.on("end", () => {
  const parsed = JSON.parse(data);
  const question = parsed.questions?.[0];
  if (!question?.assignmentId || !question?.id) {
    console.error("No seeded question available");
    process.exit(1);
  }
  process.stdout.write(`${question.assignmentId}\n${question.id}`);
});
')

  assignment_id=$(printf '%s' "$question_stats" | sed -n '1p')
  question_id=$(printf '%s' "$question_stats" | sed -n '2p')
fi

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
    console.error("Failed to save answer");
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
  process.stdout.write("SUBMIT_OK");
});
'
echo

my_attempts_response=$(curl -sS "$BASE_URL/me/attempts" \
  -H "Authorization: Bearer $student_token")

printf '%s' "$my_attempts_response" | node -e '
const target = process.argv[1];
let data = "";
process.stdin.on("data", (chunk) => { data += chunk; });
process.stdin.on("end", () => {
  const parsed = JSON.parse(data);
  const attempts = parsed.attempts ?? [];
  const found = attempts.find((item) => item.attemptId === target);
  if (!found) {
    console.error("Attempt not found in /me/attempts");
    process.exit(1);
  }
  if (typeof found.totalScore !== "number") {
    console.error("totalScore missing in /me/attempts");
    process.exit(1);
  }
  process.stdout.write("ME_ATTEMPTS_OK");
});
' "$attempt_id"
echo

attempt_detail_response=$(curl -sS "$BASE_URL/attempts/$attempt_id" \
  -H "Authorization: Bearer $student_token")

printf '%s' "$attempt_detail_response" | node -e '
const target = process.argv[1];
let data = "";
process.stdin.on("data", (chunk) => { data += chunk; });
process.stdin.on("end", () => {
  const parsed = JSON.parse(data);
  if (parsed.attemptId !== target) {
    console.error("Unexpected attemptId in /attempts/:id");
    process.exit(1);
  }
  if (!Array.isArray(parsed.questionAttempts) || parsed.questionAttempts.length === 0) {
    console.error("No questionAttempts in attempt details");
    process.exit(1);
  }
  process.stdout.write("ATTEMPT_DETAIL_OK");
});
' "$attempt_id"
echo

teacher_login=$(curl -sS -X POST "$BASE_URL/auth/login" \
  -H 'Content-Type: application/json' \
  -d "{\"email\":\"$TEACHER_EMAIL\",\"password\":\"$TEACHER_PASSWORD\"}")

teacher_token=$(printf '%s' "$teacher_login" | node -e '
let data = "";
process.stdin.on("data", (chunk) => { data += chunk; });
process.stdin.on("end", () => {
  const parsed = JSON.parse(data);
  if (!parsed.token) {
    console.error("Teacher login failed");
    process.exit(1);
  }
  process.stdout.write(parsed.token);
});
')

assignment_attempts_response=$(curl -sS "$BASE_URL/assignments/$assignment_id/attempts" \
  -H "Authorization: Bearer $teacher_token")

printf '%s' "$assignment_attempts_response" | node -e '
const target = process.argv[1];
let data = "";
process.stdin.on("data", (chunk) => { data += chunk; });
process.stdin.on("end", () => {
  const parsed = JSON.parse(data);
  if (!parsed.summary || typeof parsed.summary.totalAttempts !== "number") {
    console.error("Missing summary in assignment attempts");
    process.exit(1);
  }
  if (!Array.isArray(parsed.attempts) || parsed.attempts.length === 0) {
    console.error("No attempts in assignment attempts response");
    process.exit(1);
  }
  const found = parsed.attempts.find((item) => item.attemptId === target);
  if (!found) {
    console.error("New attempt not found in assignment attempts response");
    process.exit(1);
  }
  process.stdout.write("ASSIGNMENT_ATTEMPTS_OK");
});
' "$attempt_id"
echo
