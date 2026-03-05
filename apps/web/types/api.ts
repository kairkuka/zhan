export type Student = {
  id: string;
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
