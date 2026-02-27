import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';

import type { FastifyInstance } from 'fastify';

import { prisma } from '../../src/lib/prisma.js';
import { buildServer } from '../../src/server.js';

const DEMO_ADMIN_EMAIL = 'admin@demo.local';
const DEMO_PASSWORD = 'demo12345';

async function loginAdmin(app: FastifyInstance) {
  const response = await app.inject({
    method: 'POST',
    url: '/auth/login',
    payload: {
      email: DEMO_ADMIN_EMAIL,
      password: DEMO_PASSWORD,
    },
  });

  assert.equal(response.statusCode, 200);
  const body = response.json();
  assert.equal(typeof body.token, 'string');
  return body.token as string;
}

async function ensureSecondQuestionForSkill(app: FastifyInstance, token: string, curriculumSkillId: string) {
  const listResponse = await app.inject({
    method: 'GET',
    url: `/questions?curriculumSkillId=${curriculumSkillId}&limit=100`,
    headers: {
      authorization: `Bearer ${token}`,
    },
  });

  assert.equal(listResponse.statusCode, 200);
  const listBody = listResponse.json();
  const questions = listBody.questions as Array<{ id: string; assignmentId: string; organizationId: string }>;
  assert.ok(questions.length >= 1);

  if (questions.length >= 2) {
    return;
  }

  const baseQuestion = questions[0];
  const question = await prisma.question.create({
    data: {
      assignmentId: baseQuestion.assignmentId,
      type: 'MCQ',
      prompt: `e2e-pagination-${Date.now()}`,
      correctAnswer: '3/4',
      organizationId: baseQuestion.organizationId,
    },
  });

  await prisma.questionSkillTag.upsert({
    where: {
      questionId_curriculumSkillId: {
        questionId: question.id,
        curriculumSkillId,
      },
    },
    update: {},
    create: {
      questionId: question.id,
      curriculumSkillId,
      organizationId: baseQuestion.organizationId,
    },
  });
}

describe('Block 5 E2E', { concurrency: 1 }, () => {
  let app: FastifyInstance;

  before(async () => {
    app = await buildServer();
    await app.ready();
  });

  after(async () => {
    await app.close();
    await prisma.$disconnect();
  });

  it('login admin -> token', async () => {
    const token = await loginAdmin(app);
    assert.ok(token.length > 0);
  });

  it('GET /curriculum/skills returns skills', async () => {
    const token = await loginAdmin(app);

    const response = await app.inject({
      method: 'GET',
      url: '/curriculum/skills',
      headers: {
        authorization: `Bearer ${token}`,
      },
    });

    assert.equal(response.statusCode, 200);
    const body = response.json();
    assert.ok(Array.isArray(body.skills));
    assert.ok(body.skills.length >= 1);
    assert.equal(typeof body.skills[0].id, 'string');
    assert.equal(typeof body.skills[0].name, 'string');
  });

  it('GET /questions supports curriculum filter + cursor pagination', async () => {
    const token = await loginAdmin(app);

    const skillsResponse = await app.inject({
      method: 'GET',
      url: '/curriculum/skills',
      headers: {
        authorization: `Bearer ${token}`,
      },
    });

    assert.equal(skillsResponse.statusCode, 200);
    const skillsBody = skillsResponse.json();
    const curriculumSkillId = skillsBody.skills[0]?.id as string;
    assert.ok(curriculumSkillId);

    await ensureSecondQuestionForSkill(app, token, curriculumSkillId);

    const firstPage = await app.inject({
      method: 'GET',
      url: `/questions?curriculumSkillId=${curriculumSkillId}&limit=1&order=asc`,
      headers: {
        authorization: `Bearer ${token}`,
      },
    });

    assert.equal(firstPage.statusCode, 200);
    const firstBody = firstPage.json();
    assert.equal(Array.isArray(firstBody.questions), true);
    assert.equal(firstBody.questions.length, 1);
    assert.equal(typeof firstBody.page.nextCursor, 'string');

    const firstQuestionId = firstBody.questions[0].id as string;
    const nextCursor = firstBody.page.nextCursor as string;

    const secondPage = await app.inject({
      method: 'GET',
      url: `/questions?curriculumSkillId=${curriculumSkillId}&limit=1&order=asc&cursor=${nextCursor}`,
      headers: {
        authorization: `Bearer ${token}`,
      },
    });

    assert.equal(secondPage.statusCode, 200);
    const secondBody = secondPage.json();
    assert.equal(Array.isArray(secondBody.questions), true);
    assert.ok(secondBody.questions.length >= 1);
    assert.notEqual(secondBody.questions[0].id, firstQuestionId);
    assert.ok(secondBody.page.nextCursor === null || typeof secondBody.page.nextCursor === 'string');
  });

  it('GET /assignments/:id returns questions with nested curriculum skill', async () => {
    const token = await loginAdmin(app);

    const skillsResponse = await app.inject({
      method: 'GET',
      url: '/curriculum/skills',
      headers: {
        authorization: `Bearer ${token}`,
      },
    });

    assert.equal(skillsResponse.statusCode, 200);
    const skillsBody = skillsResponse.json();
    const curriculumSkillId = skillsBody.skills[0]?.id as string;
    assert.ok(curriculumSkillId);

    const questionsResponse = await app.inject({
      method: 'GET',
      url: `/questions?curriculumSkillId=${curriculumSkillId}&limit=1`,
      headers: {
        authorization: `Bearer ${token}`,
      },
    });

    assert.equal(questionsResponse.statusCode, 200);
    const questionsBody = questionsResponse.json();
    assert.ok(questionsBody.questions.length >= 1);
    const assignmentId = questionsBody.questions[0].assignmentId as string;

    const assignmentResponse = await app.inject({
      method: 'GET',
      url: `/assignments/${assignmentId}`,
      headers: {
        authorization: `Bearer ${token}`,
      },
    });

    assert.equal(assignmentResponse.statusCode, 200);
    const assignmentBody = assignmentResponse.json();
    assert.ok(Array.isArray(assignmentBody.questions));
    assert.ok(assignmentBody.questions.length >= 1);

    const hasNestedCurriculumTag = assignmentBody.questions.some(
      (question: {
        skillTags?: Array<{
          curriculumSkillId?: string | null;
          curriculumSkill?: { id: string } | null;
        }>;
      }) =>
        (question.skillTags ?? []).some(
          (tag) => Boolean(tag.curriculumSkillId) && Boolean(tag.curriculumSkill?.id),
        ),
    );
    assert.equal(hasNestedCurriculumTag, true);
  });

  it('protected endpoints return 401 without token and error wrapper', async () => {
    const protectedResponses = await Promise.all([
      app.inject({ method: 'GET', url: '/curriculum/skills' }),
      app.inject({ method: 'GET', url: '/questions' }),
      app.inject({ method: 'GET', url: '/assignments/c111111111111111111111111' }),
    ]);

    for (const response of protectedResponses) {
      assert.equal(response.statusCode, 401);
      const body = response.json();
      assert.equal(typeof body.error?.code, 'string');
      assert.equal(typeof body.error?.message, 'string');
    }
  });
});
