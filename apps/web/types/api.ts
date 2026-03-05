export type Student = {
  id: string;
};

export type MasterySkill = {
  skillId?: string;
  currentMastery: number;
  risk?: string;
};

export type MasteryOverview = {
  averageMastery: number;
  skillsTracked: number;
  riskLevel?: string;
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
