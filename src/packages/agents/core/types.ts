export type AgentType =
  | 'StudentProgressSummary'
  | 'AtRiskStudentDetection'
  | 'AssignmentFeedback'
  | 'AttendanceAnomaly'
  | 'TeacherWorkloadInsight';

export type AgentTargetType = 'Student' | 'Teacher' | 'ClassSection' | 'Assignment' | 'Submission' | 'LogGroup' | 'Job';

export interface AgentRecommendation {
  action: string;
  recommendedOwner: 'Teacher' | 'Advisor' | 'Admin' | 'Guardian' | 'Student';
  urgency: 'Low' | 'Medium' | 'High' | 'Critical';
}

export interface AgentOutput {
  summary: string;
  strengths: string[];
  concerns: string[];
  confidenceScore: number; // 0.0 to 1.0
  findings: string[];
  recommendations: AgentRecommendation[];
  limitations: string[];
  metadata: Record<string, any>;
}

export interface AgentRunResult {
  runId: string;
  agentType: AgentType;
  targetType: AgentTargetType;
  targetId: string;
  confidenceScore: number;
  output: AgentOutput;
  trace: string[]; // Chain of thought reasoning steps
  completedAt: Date;
}
