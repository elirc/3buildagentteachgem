import { AgentOutput, AgentRecommendation } from '../core/types';

export interface AtRiskDetectionInput {
  student: {
    id: string;
    firstName: string;
    lastName: string;
  };
  gradeAverage: number;
  missingAssignmentsCount: number;
  absencesCount: number;
  tardiesCount: number;
  hasActiveIntervention: boolean;
  recentNotesCount: number;
  recentEscalationKeywordsFound: boolean;
}

/**
 * Deterministic At-Risk Student Detection Agent.
 * Runs comprehensive risk scoring heuristics and generates actionable escalations.
 */
export function runAtRiskStudentDetectionAgent(input: AtRiskDetectionInput): {
  output: AgentOutput;
  trace: string[];
} {
  const trace: string[] = [];
  const {
    student,
    gradeAverage,
    missingAssignmentsCount,
    absencesCount,
    tardiesCount,
    hasActiveIntervention,
    recentNotesCount,
    recentEscalationKeywordsFound,
  } = input;
  const studentName = `${student.firstName} ${student.lastName}`;

  trace.push(`[1. Init] Starting At-Risk Detection Agent for student: "${studentName}"`);
  trace.push(`[2. Parameters Loaded] Grade Avg: ${gradeAverage}%, Missing HWs: ${missingAssignmentsCount}, Absences: ${absencesCount}, Tardies: ${tardiesCount}, Active Intervention: ${hasActiveIntervention}`);

  let riskScore = 0;
  const evidence: string[] = [];
  const concerns: string[] = [];
  const strengths: string[] = [];
  const recommendations: AgentRecommendation[] = [];
  const limitations: string[] = [];
  let confidenceScore = 0.95;

  // 1. Grade Performance Heuristic
  trace.push('[3. Heuristic: Academics] Evaluating grade average impact...');
  if (gradeAverage < 60) {
    riskScore += 40;
    evidence.push(`Grade average is critically low at ${gradeAverage}%.`);
    concerns.push('Severe academic performance deficit.');
    trace.push('+40 risk score: Grade average below 60%');
  } else if (gradeAverage < 70) {
    riskScore += 25;
    evidence.push(`Grade average is substandard at ${gradeAverage}%.`);
    concerns.push('Moderate academic performance deficit.');
    trace.push('+25 risk score: Grade average below 70%');
  } else if (gradeAverage >= 85) {
    strengths.push(`Maintaining excellent academic grades (${gradeAverage}%).`);
    trace.push('Strong grades detected. Mitigating factor.');
  }

  // 2. Attendance Absences Heuristic
  trace.push('[4. Heuristic: Attendance] Evaluating absence counts...');
  const attendanceImpact = absencesCount * 8 + tardiesCount * 2.5;
  riskScore += attendanceImpact;
  trace.push(`+${Math.round(attendanceImpact)} risk score: Absences (${absencesCount}) and Tardies (${tardiesCount})`);
  
  if (absencesCount >= 5) {
    evidence.push(`Chronic absenteeism: student has ${absencesCount} absences.`);
    concerns.push('Chronic attendance absences.');
  } else if (absencesCount >= 3) {
    evidence.push(`Moderate absenteeism: student has ${absencesCount} absences.`);
    concerns.push('Attendance warnings.');
  }

  // 3. Missing Homework/Engagement Heuristic
  trace.push('[5. Heuristic: Engagement] Evaluating homework evasion...');
  if (missingAssignmentsCount >= 4) {
    riskScore += 30;
    evidence.push(`Severe homework evasion: ${missingAssignmentsCount} missing assignments.`);
    concerns.push('Chronic missing work backlog.');
    trace.push('+30 risk score: 4+ missing assignments');
  } else if (missingAssignmentsCount >= 2) {
    riskScore += 15;
    evidence.push(`Moderate homework gaps: ${missingAssignmentsCount} missing assignments.`);
    concerns.push('Frequent missing assignments.');
    trace.push('+15 risk score: 2+ missing assignments');
  }

  // 4. Notes Context and Escalation Keywords Heuristic
  if (recentEscalationKeywordsFound) {
    riskScore += 10;
    evidence.push('Academic counselor or teacher notes contain escalation keywords indicating behavioral/family concerns.');
    trace.push('+10 risk score: Escalation keywords matching "absence", "fail", "struggling"');
  }

  // 5. Cap risk score at 100
  riskScore = Math.min(100, Math.round(riskScore));
  trace.push(`[6. Aggregate Risk] Raw risk score calculated at: ${riskScore}`);

  // Determine risk level category
  let riskLevel: 'Low' | 'Medium' | 'High' | 'Critical' = 'Low';
  if (riskScore >= 80) {
    riskLevel = 'Critical';
  } else if (riskScore >= 50) {
    riskLevel = 'High';
  } else if (riskScore >= 25) {
    riskLevel = 'Medium';
  }

  // 6. Active Intervention Check & Adjustments
  trace.push('[7. Heuristic: Support] Checking support status...');
  if (hasActiveIntervention) {
    trace.push('Mitigation factor: Active Intervention Plan is already in place.');
    if (riskLevel === 'Critical') {
      recommendations.push({
        action: 'Escalate active Intervention Plan to multi-disciplinary case conference.',
        recommendedOwner: 'Admin',
        urgency: 'Critical',
      });
    } else {
      recommendations.push({
        action: 'Perform routine bi-weekly follow-up on active Intervention Plan objectives.',
        recommendedOwner: 'Advisor',
        urgency: 'Medium',
      });
    }
  } else {
    // No active plan, need to create one!
    if (riskLevel === 'Critical' || riskLevel === 'High') {
      recommendations.push({
        action: `Formulate a targeted Academic and Attendance Intervention Plan for ${student.firstName}.`,
        recommendedOwner: 'Advisor',
        urgency: 'High',
      });
      recommendations.push({
        action: 'Schedule an immediate face-to-face parent-guardian meeting.',
        recommendedOwner: 'Advisor',
        urgency: 'High',
      });
    } else if (riskLevel === 'Medium') {
      recommendations.push({
        action: 'Teacher to conduct informal classroom check-in and offer support resources.',
        recommendedOwner: 'Teacher',
        urgency: 'Medium',
      });
    }
  }

  // Data quality warnings
  if (recentNotesCount === 0) {
    confidenceScore -= 0.05;
    limitations.push('Absence of anecdotal counselor notes. Analysis is based entirely on numeric indicators.');
  }

  const primaryRiskArea = riskScore >= 50 ? (absencesCount >= 4 ? 'Attendance' : 'Grades') : 'None';

  const summary = `Student ${studentName} is flagged at ${riskLevel.toUpperCase()} RISK (Risk Score: ${riskScore}/100). The primary risk vectors are related to ${primaryRiskArea === 'None' ? 'general operations' : primaryRiskArea.toLowerCase() + ' performance'}. Heuristic analysis suggests that structured and immediate intervention is ${riskLevel === 'Critical' || riskLevel === 'High' ? 'strictly required' : 'recommended'} to prevent academic failure.`;

  trace.push(`[8. Complete] Risk analysis compiled. Overall level: [${riskLevel}]`);

  return {
    output: {
      summary,
      strengths,
      concerns,
      confidenceScore: Math.round(confidenceScore * 100) / 100,
      findings: evidence,
      recommendations,
      limitations,
      metadata: {
        rawRiskScore: riskScore,
        riskLevel,
        primaryRiskArea,
        suggestedFollowUpDays: riskLevel === 'Critical' ? 3 : riskLevel === 'High' ? 7 : 14,
      },
    },
    trace,
  };
}
