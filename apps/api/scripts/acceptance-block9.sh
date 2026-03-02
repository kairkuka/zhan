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

question_info=$(curl -sS "$BASE_URL/questions?limit=1" \
  -H "Authorization: Bearer $admin_token" | node -e '
let data = "";
process.stdin.on("data", (chunk) => { data += chunk; });
process.stdin.on("end", () => {
  const parsed = JSON.parse(data);
  const question = parsed.questions?.[0];
  const tag = question?.skillTags?.find((item) => item.curriculumSkillId);
  if (!question?.assignmentId || !question?.id || !question?.organizationId || !tag?.curriculumSkillId) {
    console.error("Missing seeded question with curriculum skill");
    process.exit(1);
  }
  process.stdout.write(`${question.assignmentId}\n${question.id}\n${question.organizationId}\n${tag.curriculumSkillId}`);
});
')

assignment_id=$(printf '%s' "$question_info" | sed -n '1p')
mcq_question_id=$(printf '%s' "$question_info" | sed -n '2p')
organization_id=$(printf '%s' "$question_info" | sed -n '3p')
curriculum_skill_id=$(printf '%s' "$question_info" | sed -n '4p')

echo "ASSIGNMENT_ID=$assignment_id"
echo "MCQ_QUESTION_ID=$mcq_question_id"
echo "CURRICULUM_SKILL_ID=$curriculum_skill_id"

numeric_question_id=$(
  ASSIGNMENT_ID="$assignment_id" CURRICULUM_SKILL_ID="$curriculum_skill_id" ORGANIZATION_ID="$organization_id" \
    pnpm --filter @skyvern/api exec dotenv -e ../../.env -- node --input-type=module -e '
import { PrismaClient, QuestionType } from "@prisma/client";

const assignmentId = process.env.ASSIGNMENT_ID;
const curriculumSkillId = process.env.CURRICULUM_SKILL_ID;
const organizationId = process.env.ORGANIZATION_ID;

if (!assignmentId || !curriculumSkillId || !organizationId) {
  console.error("Missing env for numeric question bootstrap");
  process.exit(1);
}

const prisma = new PrismaClient();

try {
  const existing = await prisma.question.findFirst({
    where: {
      assignmentId,
      type: {
        not: QuestionType.MCQ,
      },
      organizationId,
      skillTags: {
        some: {
          curriculumSkillId,
        },
      },
    },
    select: {
      id: true,
    },
  });

  if (existing) {
    process.stdout.write(existing.id);
  } else {
    const created = await prisma.question.create({
      data: {
        assignmentId,
        type: QuestionType.NUMERIC,
        prompt: "Synthetic numeric mastery probe",
        correctAnswer: "42",
        organizationId,
      },
      select: {
        id: true,
      },
    });

    await prisma.questionSkillTag.upsert({
      where: {
        questionId_curriculumSkillId: {
          questionId: created.id,
          curriculumSkillId,
        },
      },
      update: {},
      create: {
        questionId: created.id,
        curriculumSkillId,
        organizationId,
      },
    });

    process.stdout.write(created.id);
  }
} finally {
  await prisma.$disconnect();
}
'
)

if [[ -z "$numeric_question_id" ]]; then
  echo "Failed to resolve numeric question id"
  exit 1
fi

echo "NUMERIC_QUESTION_ID=$numeric_question_id"

start_attempt() {
  local start_response
  start_response=$(curl -sS -X POST "$BASE_URL/assignments/$assignment_id/start" \
    -H "Authorization: Bearer $student_token")
  printf '%s' "$start_response" | node -e '
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
'
}

submit_answer() {
  local attempt_id="$1"
  local question_id="$2"
  local answer_payload="$3"
  curl -sS -X POST "$BASE_URL/attempts/$attempt_id/answer" \
    -H "Authorization: Bearer $student_token" \
    -H 'Content-Type: application/json' \
    -d "{\"questionId\":\"$question_id\",\"answer\":$answer_payload}" | node -e '
let data = "";
process.stdin.on("data", (chunk) => { data += chunk; });
process.stdin.on("end", () => {
  const parsed = JSON.parse(data);
  if (!parsed.questionAttempt?.id) {
    console.error("Failed to save answer");
    process.exit(1);
  }
});
'
}

submit_attempt() {
  local attempt_id="$1"
  curl -sS -X POST "$BASE_URL/attempts/$attempt_id/submit" \
    -H "Authorization: Bearer $student_token" | node -e '
let data = "";
process.stdin.on("data", (chunk) => { data += chunk; });
process.stdin.on("end", () => {
  const parsed = JSON.parse(data);
  if (parsed.status !== "SUBMITTED") {
    console.error("Attempt status is not SUBMITTED");
    process.exit(1);
  }
});
'
}

attempt_one_id=$(start_attempt)
echo "ATTEMPT_ONE=$attempt_one_id"
submit_answer "$attempt_one_id" "$mcq_question_id" '{"choice":"A"}'
submit_attempt "$attempt_one_id"

attempt_two_id=$(start_attempt)
echo "ATTEMPT_TWO=$attempt_two_id"
submit_answer "$attempt_two_id" "$mcq_question_id" '{"choice":"A"}'
submit_answer "$attempt_two_id" "$numeric_question_id" '{"value":42}'
submit_attempt "$attempt_two_id"

history_response=$(curl -sS "$BASE_URL/me/mastery/$curriculum_skill_id/history" \
  -H "Authorization: Bearer $student_token")

printf '%s' "$history_response" | node -e '
let data = "";
process.stdin.on("data", (chunk) => { data += chunk; });
process.stdin.on("end", () => {
  const parsed = JSON.parse(data);
  const history = parsed.history ?? [];
  if (!Array.isArray(history) || history.length < 2) {
    console.error("History has less than 2 snapshots");
    process.exit(1);
  }
  const first = history[0]?.masteryLevel;
  const last = history[history.length - 1]?.masteryLevel;
  if (typeof first !== "number" || typeof last !== "number") {
    console.error("Invalid masteryLevel values in history");
    process.exit(1);
  }
  if (first === last) {
    console.error("Mastery level did not change");
    process.exit(1);
  }
  process.stdout.write("MASTERY_HISTORY_OK");
});
'
echo
