export type Student = {
  id: string;
};

export type AuthRole = 'ADMIN' | 'TEACHER' | 'PARENT' | 'STUDENT';

export type AuthUser = {
  id: string;
  email: string;
  role: AuthRole;
  organizationId: string;
};

export type RiskLevel = 'LOW' | 'MEDIUM' | 'HIGH' | 'UNKNOWN';
export type TrendDirection = 'UP' | 'DOWN' | 'FLAT' | 'INSUFFICIENT_DATA';

export type MasterySkill = {
  skillId?: string;
  currentMastery: number;
  risk?: RiskLevel;
  trend?: TrendDirection;
};

export type MasteryOverview = {
  averageMastery: number;
  skillsTracked: number;
  riskLevel?: RiskLevel;
  skills?: MasterySkill[];
};

export type TrendBucket = {
  date: string;
  averageMastery: number;
  skillsTracked: number;
};

export type MasteryTrendResponse = {
  buckets: TrendBucket[];
  nextCursor?: string | null;
};

export type CurriculumListItem = {
  id: string;
  name: string;
  createdAt: string;
  unitsCount: number;
};

export type CurriculumQuestionTag = {
  id: string;
  questionId: string;
};

export type CurriculumSkillDetail = {
  id: string;
  name: string;
  questionTags: CurriculumQuestionTag[];
};

export type CurriculumTopicDetail = {
  id: string;
  name: string;
  order: number;
  skills: CurriculumSkillDetail[];
};

export type CurriculumUnitDetail = {
  id: string;
  name: string;
  order: number;
  topics: CurriculumTopicDetail[];
};

export type CurriculumDetail = {
  id: string;
  name: string;
  createdAt: string;
  units: CurriculumUnitDetail[];
};

export type AttemptStatus = 'IN_PROGRESS' | 'SUBMITTED';

export type AttemptListItem = {
  attemptId: string;
  assignmentId: string;
  studentId: string;
  status: AttemptStatus;
  startedAt: string;
  submittedAt: string | null;
  totalScore: number;
};

export type AttemptAnswerDetail = {
  questionId?: string;
  score?: number | null;
  feedback?: string | null;
};

export type AttemptDetail = {
  attemptId: string;
  assignmentId?: string;
  studentId?: string;
  status?: AttemptStatus;
  createdAt?: string;
  submittedAt?: string | null;
  totalScore?: number;
  questionAttempts?: AttemptAnswerDetail[];
};

export type MasterySnapshotItem = {
  id: string;
  createdAt: string;
  averageMastery: number;
  skillsTracked: number;
  riskLevel: RiskLevel;
};

export type StudentProjection = {
  studentId: string;
  skillsTracked: number;
  averageMastery: number;
  riskLevel: RiskLevel;
  highRiskSkills: number;
  mediumRiskSkills: number;
  lowRiskSkills: number;
};
