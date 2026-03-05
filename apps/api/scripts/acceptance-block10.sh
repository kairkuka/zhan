#!/usr/bin/env bash
set -euo pipefail

BASE_URL="${API_BASE_URL:-http://localhost:4000}"
STUDENT_EMAIL="${STUDENT_EMAIL:-student@demo.local}"
STUDENT_PASSWORD="${STUDENT_PASSWORD:-demo12345}"

# Reuse existing flow to ensure there is mastery history and submitted attempts.
bash ./scripts/acceptance-block9.sh

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

skill_id=$(curl -sS "$BASE_URL/me/mastery" \
  -H "Authorization: Bearer $student_token" | node -e '
let data = "";
process.stdin.on("data", (chunk) => { data += chunk; });
process.stdin.on("end", () => {
  const parsed = JSON.parse(data);
  const skill = parsed.skills?.find((item) => item.totalAttempts > 0);
  if (!skill?.curriculumSkillId) {
    console.error("No mastery skill found for projection");
    process.exit(1);
  }
  process.stdout.write(skill.curriculumSkillId);
});
')

echo "SKILL_ID=$skill_id"

projection_response=$(curl -sS "$BASE_URL/me/mastery/$skill_id/projection" \
  -H "Authorization: Bearer $student_token")

printf '%s' "$projection_response" | node -e '
let data = "";
process.stdin.on("data", (chunk) => { data += chunk; });
process.stdin.on("end", () => {
  const parsed = JSON.parse(data);
  if (typeof parsed.currentMastery !== "number") {
    console.error("currentMastery must be a number");
    process.exit(1);
  }
  if (typeof parsed.trend !== "string" || parsed.trend.length === 0) {
    console.error("trend is missing");
    process.exit(1);
  }
  if (typeof parsed.velocity !== "number" || Number.isNaN(parsed.velocity)) {
    console.error("velocity must be a number");
    process.exit(1);
  }
  if (typeof parsed.risk !== "string" || parsed.risk.length === 0) {
    console.error("risk is missing");
    process.exit(1);
  }
  process.stdout.write("PROJECTION_OK");
});
'
echo
