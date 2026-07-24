export type RiskLevel = 'Low' | 'Medium' | 'High' | 'Critical';
export type RiskArea = 'Grades' | 'Attendance' | 'Engagement' | 'None';

export interface StudentRiskInput {
  gradeAverage: number;
  missingAssignmentsCount: number;
  absencesCount: number;
  tardiesCount: number;
}

export interface RiskAnalysis {
  overallRiskLevel: RiskLevel;
  primaryRiskArea: RiskArea;
  evidence: string[];
  gradesRisk: RiskLevel;
  attendanceRisk: RiskLevel;
  engagementRisk: RiskLevel;
}

/**
 * Calculates a student's risk analysis based on academic and attendance metrics.
 */
export function calculateStudentRisk(input: StudentRiskInput): RiskAnalysis {
  const { gradeAverage, missingAssignmentsCount, absencesCount, tardiesCount } = input;
  const evidence: string[] = [];

  // 1. Grade Risk Assessment
  let gradesRisk: RiskLevel = 'Low';
  if (gradeAverage < 60) {
    gradesRisk = 'High';
    evidence.push(`Critical academic performance: Section average is ${gradeAverage}%.`);
  } else if (gradeAverage < 70) {
    gradesRisk = 'Medium';
    evidence.push(`Substandard academic performance: Section average is ${gradeAverage}%.`);
  } else if (gradeAverage < 80) {
    evidence.push(`Marginal academic performance: Section average is ${gradeAverage}%.`);
  }

  // 2. Attendance Risk Assessment (Tardies count as 0.3 of an absence)
  const weightedAbsences = absencesCount + tardiesCount * 0.3;
  let attendanceRisk: RiskLevel = 'Low';
  if (weightedAbsences >= 5) {
    attendanceRisk = 'High';
    evidence.push(`Severe attendance concerns: ${absencesCount} absences and ${tardiesCount} tardies.`);
  } else if (weightedAbsences >= 3) {
    attendanceRisk = 'Medium';
    evidence.push(`Moderate attendance concerns: ${absencesCount} absences and ${tardiesCount} tardies.`);
  }

  // 3. Engagement Risk Assessment (based on missing assignments)
  let engagementRisk: RiskLevel = 'Low';
  if (missingAssignmentsCount >= 4) {
    engagementRisk = 'High';
    evidence.push(`Severe engagement concerns: ${missingAssignmentsCount} missing assignments.`);
  } else if (missingAssignmentsCount >= 2) {
    engagementRisk = 'Medium';
    evidence.push(`Moderate engagement concerns: ${missingAssignmentsCount} missing assignments.`);
  }

  // 4. Overall Risk Level & Primary Area Determination
  let overallRiskLevel: RiskLevel = 'Low';
  let primaryRiskArea: RiskArea = 'None';

  // Count severe and moderate areas
  let highCount = 0;
  let mediumCount = 0;

  if (gradesRisk === 'High') highCount++;
  if (attendanceRisk === 'High') highCount++;
  if (engagementRisk === 'High') highCount++;

  if (gradesRisk === 'Medium') mediumCount++;
  if (attendanceRisk === 'Medium') mediumCount++;
  if (engagementRisk === 'Medium') mediumCount++;

  // Combine rules for Critical
  if (highCount >= 2 || (gradesRisk === 'High' && gradeAverage < 55) || (attendanceRisk === 'High' && absencesCount >= 7)) {
    overallRiskLevel = 'Critical';
  } else if (highCount === 1) {
    overallRiskLevel = 'High';
  } else if (mediumCount >= 1) {
    overallRiskLevel = 'Medium';
  }

  // Determine Primary Risk Area (highest priority is Grades, then Attendance, then Engagement)
  if (gradesRisk === 'High' || gradesRisk === 'Medium') {
    primaryRiskArea = 'Grades';
  } else if (attendanceRisk === 'High' || attendanceRisk === 'Medium') {
    primaryRiskArea = 'Attendance';
  } else if (engagementRisk === 'High' || engagementRisk === 'Medium') {
    primaryRiskArea = 'Engagement';
  }

  if (evidence.length === 0) {
    evidence.push('Student is meeting all academic and operational benchmarks.');
  }

  return {
    overallRiskLevel,
    primaryRiskArea,
    evidence,
    gradesRisk,
    attendanceRisk,
    engagementRisk,
  };
}
