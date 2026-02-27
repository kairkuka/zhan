import { PrismaClient, QuestionType, Role } from '@prisma/client';
import argon2 from 'argon2';

const prisma = new PrismaClient();
const DEMO_PASSWORD = 'demo12345';

async function clearDemoData() {
  await prisma.questionSkillTag.deleteMany();
  await prisma.attemptAnswer.deleteMany();
  await prisma.attempt.deleteMany();
  await prisma.question.deleteMany();
  await prisma.assignmentRelease.deleteMany();
  await prisma.assignment.deleteMany();
  await prisma.curriculumSkill.deleteMany();
  await prisma.curriculumTopic.deleteMany();
  await prisma.unit.deleteMany();
  await prisma.subject.deleteMany();
  await prisma.objective.deleteMany();
  await prisma.skill.deleteMany();
  await prisma.topic.deleteMany();
  await prisma.module.deleteMany();
  await prisma.course.deleteMany();
  await prisma.masterySnapshot.deleteMany();
  await prisma.classEnrollment.deleteMany();
  await prisma.classGroup.deleteMany();
  await prisma.parentStudentLink.deleteMany();
  await prisma.teacher.deleteMany();
  await prisma.parent.deleteMany();
  await prisma.student.deleteMany();
  await prisma.eventLog.deleteMany();
  await prisma.user.deleteMany();
  await prisma.organization.deleteMany();
}

async function main() {
  await clearDemoData();

  const [adminPasswordHash, teacherPasswordHash, parentPasswordHash, studentPasswordHash] =
    await Promise.all([
      argon2.hash(DEMO_PASSWORD),
      argon2.hash(DEMO_PASSWORD),
      argon2.hash(DEMO_PASSWORD),
      argon2.hash(DEMO_PASSWORD),
    ]);

  const organization = await prisma.organization.create({
    data: {
      name: 'Demo Academy',
    },
  });

  const adminUser = await prisma.user.create({
    data: {
      email: 'admin@demo.local',
      passwordHash: adminPasswordHash,
      role: Role.ADMIN,
      organizationId: organization.id,
    },
  });

  const teacherUser = await prisma.user.create({
    data: {
      email: 'teacher@demo.local',
      passwordHash: teacherPasswordHash,
      role: Role.TEACHER,
      organizationId: organization.id,
    },
  });

  const parentUser = await prisma.user.create({
    data: {
      email: 'parent@demo.local',
      passwordHash: parentPasswordHash,
      role: Role.PARENT,
      organizationId: organization.id,
    },
  });

  const studentUser = await prisma.user.create({
    data: {
      email: 'student@demo.local',
      passwordHash: studentPasswordHash,
      role: Role.STUDENT,
      organizationId: organization.id,
    },
  });

  const teacher = await prisma.teacher.create({
    data: {
      userId: teacherUser.id,
      organizationId: organization.id,
    },
  });

  const parent = await prisma.parent.create({
    data: {
      userId: parentUser.id,
      organizationId: organization.id,
    },
  });

  const student = await prisma.student.create({
    data: {
      userId: studentUser.id,
      organizationId: organization.id,
    },
  });

  const classGroup = await prisma.classGroup.create({
    data: {
      name: 'Class 5A',
      organizationId: organization.id,
    },
  });

  await prisma.parentStudentLink.create({
    data: {
      parentId: parent.id,
      studentId: student.id,
      organizationId: organization.id,
    },
  });

  await prisma.classEnrollment.create({
    data: {
      classGroupId: classGroup.id,
      studentId: student.id,
      organizationId: organization.id,
    },
  });

  const subject = await prisma.subject.create({
    data: {
      name: 'Mathematics 5',
      organizationId: organization.id,
    },
  });

  const fractionsUnit = await prisma.unit.create({
    data: {
      name: 'Fractions',
      subjectId: subject.id,
      order: 1,
    },
  });

  const decimalsUnit = await prisma.unit.create({
    data: {
      name: 'Decimals',
      subjectId: subject.id,
      order: 2,
    },
  });

  const addingFractionsTopic = await prisma.curriculumTopic.create({
    data: {
      name: 'Adding Fractions',
      unitId: fractionsUnit.id,
      order: 1,
    },
  });

  const comparingDecimalsTopic = await prisma.curriculumTopic.create({
    data: {
      name: 'Comparing Decimals',
      unitId: decimalsUnit.id,
      order: 1,
    },
  });

  const denominatorSkill = await prisma.curriculumSkill.create({
    data: {
      name: 'Find common denominator',
      topicId: addingFractionsTopic.id,
    },
  });

  const decimalOrderSkill = await prisma.curriculumSkill.create({
    data: {
      name: 'Compare decimal values',
      topicId: comparingDecimalsTopic.id,
    },
  });

  const demoCourse = await prisma.course.create({
    data: {
      grade: '5',
      subject: 'Mathematics',
      organizationId: organization.id,
    },
  });

  const demoAssignment = await prisma.assignment.create({
    data: {
      title: 'Diagnostic Quiz 1',
      courseId: demoCourse.id,
      organizationId: organization.id,
      createdBy: adminUser.id,
    },
  });

  const demoQuestion = await prisma.question.create({
    data: {
      assignmentId: demoAssignment.id,
      type: QuestionType.MCQ,
      prompt: 'What is 1/2 + 1/4?',
      correctAnswer: '3/4',
      organizationId: organization.id,
    },
  });

  const initialQuestionCurriculumTag = await prisma.questionSkillTag.create({
    data: {
      questionId: demoQuestion.id,
      curriculumSkillId: denominatorSkill.id,
      organizationId: organization.id,
    },
  });

  console.log('Seed complete. Demo data created:');
  console.log(
    JSON.stringify(
      {
        organization: { id: organization.id, name: organization.name },
        users: {
          admin: { id: adminUser.id, email: adminUser.email },
          teacher: { id: teacherUser.id, email: teacherUser.email, teacherId: teacher.id },
          parent: { id: parentUser.id, email: parentUser.email, parentId: parent.id },
          student: { id: studentUser.id, email: studentUser.email, studentId: student.id },
        },
        classGroup: { id: classGroup.id, name: classGroup.name },
        curriculum: {
          subject: { id: subject.id, name: subject.name },
          units: [
            { id: fractionsUnit.id, name: fractionsUnit.name },
            { id: decimalsUnit.id, name: decimalsUnit.name },
          ],
          topics: [
            { id: addingFractionsTopic.id, name: addingFractionsTopic.name },
            { id: comparingDecimalsTopic.id, name: comparingDecimalsTopic.name },
          ],
          skills: [
            { id: denominatorSkill.id, name: denominatorSkill.name },
            { id: decimalOrderSkill.id, name: decimalOrderSkill.name },
          ],
        },
        question: {
          id: demoQuestion.id,
          assignmentId: demoAssignment.id,
          initialCurriculumTagId: initialQuestionCurriculumTag.id,
          curriculumSkillId: denominatorSkill.id,
        },
      },
      null,
      2,
    ),
  );
  console.log('Demo login credentials:');
  console.log(`admin@demo.local / ${DEMO_PASSWORD}`);
  console.log(`teacher@demo.local / ${DEMO_PASSWORD}`);
  console.log(`parent@demo.local / ${DEMO_PASSWORD}`);
  console.log(`student@demo.local / ${DEMO_PASSWORD}`);
}

main()
  .catch((error) => {
    console.error('Seed failed:', error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
