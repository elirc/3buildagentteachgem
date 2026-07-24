import { AgentOutput, AgentRecommendation } from '../core/types';

export interface StudentProgressInput {
  student: {
    id: string;
    firstName: string;
    lastName: string;
    enrollmentStatus: string;
  };
  enrollments: Array<{
    sectionId: string;
    courseCode: string;
    courseTitle: string;
    finalGrade: number | null;
  }>;
  submissions: Array<{
    assignmentId: string;
    assignmentTitle: string;
    courseCode: string;
    status: string;
    score: number | null;
    pointsPossible: number;
    dueDate: string;
  }>;
  attendance: Array<{
    courseCode: string;
    status: string;
    date: string;
  }>;
  supportNotes: Array<{
    noteType: string;
    content: string;
  }>;
  interventionPlans: Array<{
    status: string;
    summary: string;
  }>;
}

/**
 * Deterministic Student Progress Summary Agent.
 * Simulates Chain-of-Thought LLM analysis via structured code heuristics.
 */
export function runStudentProgressSummaryAgent(input: StudentProgressInput): {
  output: AgentOutput;
  trace: string[];
} {
  const trace: string[] = [];
  const { student, enrollments, submissions, attendance, supportNotes, interventionPlans } = input;
  const studentName = `${student.firstName} ${student.lastName}`;

  trace.push(`[1. Init] Initializing Student Progress Summary Agent for student: "${studentName}" (ID: ${student.id})`);
  trace.push(`[2. Load Data] Loaded ${enrollments.length} enrollments, ${submissions.length} submissions, ${attendance.length} attendance logs, ${supportNotes.length} notes, and ${interventionPlans.length} active plans.`);

  // Heuristics variables
  const strengths: string[] = [];
  const concerns: string[] = [];
  const findings: string[] = [];
  const recommendations: AgentRecommendation[] = [];
  const limitations: string[] = [];
  let confidenceScore = 1.0;

  // Check data availability limitations
  if (attendance.length === 0) {
    confidenceScore -= 0.15;
    limitations.push('Absence of attendance tracking data. Analysis is constrained purely to academic grades.');
    trace.push('[Limitation Alert] No attendance logs detected. Lowering confidence by 15%.');
  }
  if (submissions.length === 0) {
    confidenceScore -= 0.25;
    limitations.push('Zero assignment submission history. Academic progress evaluation is incomplete.');
    trace.push('[Limitation Alert] No submission history found! Lowering confidence by 25%.');
  }

  // 1. Analyze academic performance
  trace.push('[3. Analysis: Academics] Analyzing class section averages and submission grades...');
  let totalGrade = 0;
  let gradedSectionsCount = 0;
  
  for (const enroll of enrollments) {
    if (enroll.finalGrade !== null) {
      totalGrade += enroll.finalGrade;
      gradedSectionsCount++;
      
      trace.push(`Checking enrollment: ${enroll.courseCode} average is ${enroll.finalGrade}%.`);
      if (enroll.finalGrade >= 85) {
        strengths.push(`Excellent performance in ${enroll.courseTitle} (${enroll.courseCode}) with a ${enroll.finalGrade}% average.`);
      } else if (enroll.finalGrade < 70) {
        concerns.push(`Critically low grade in ${enroll.courseTitle} (${enroll.courseCode}) currently at ${enroll.finalGrade}%.`);
      }
    }
  }

  const overallAverage = gradedSectionsCount > 0 ? totalGrade / gradedSectionsCount : 80; // default standard average
  findings.push(`Student is active in ${enrollments.length} class sections, maintaining an overall section average of ${Math.round(overallAverage)}%.`);

  // 2. Analyze engagement & missing assignments
  trace.push('[4. Analysis: Engagement] Examining assignment submission history...');
  const missingSubmissions = submissions.filter((s) => s.status === 'Missing');
  const gradedSubmissions = submissions.filter((s) => s.status === 'Graded');

  if (missingSubmissions.length > 0) {
    concerns.push(`Found ${missingSubmissions.length} unsubmitted (Missing) assignments.`);
    trace.push(`[Engagement Alert] Detected ${missingSubmissions.length} Missing assignments.`);
    
    if (missingSubmissions.length >= 3) {
      findings.push(`Severe engagement gap: ${missingSubmissions.length} assignments are marked Missing.`);
      recommendations.push({
        action: `Coordinate missing homework make-up plan with ${student.firstName}.`,
        recommendedOwner: 'Teacher',
        urgency: 'High',
      });
    } else {
      findings.push(`Minor homework backlog: ${missingSubmissions.length} assignments are marked Missing.`);
      recommendations.push({
        action: 'Send homework reminder notification to student.',
        recommendedOwner: 'Student',
        urgency: 'Medium',
      });
    }
  }

  // Grade Trend: compare first half and second half of graded assignments
  if (gradedSubmissions.length >= 2) {
    trace.push('[5. Analysis: Trends] Checking for grade trajectories...');
    // Sort submissions by date ascending
    const sorted = [...gradedSubmissions].sort((a, b) => new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime());
    const midPoint = Math.floor(sorted.length / 2);
    const firstHalf = sorted.slice(0, midPoint);
    const secondHalf = sorted.slice(midPoint);

    const firstAvg = firstHalf.reduce((sum, s) => sum + ((s.score || 0) / s.pointsPossible) * 100, 0) / firstHalf.length;
    const secondAvg = secondHalf.reduce((sum, s) => sum + ((s.score || 0) / s.pointsPossible) * 100, 0) / secondHalf.length;

    trace.push(`Grade trajectory calculated: Early average = ${Math.round(firstAvg)}%, Recent average = ${Math.round(secondAvg)}%`);
    if (secondAvg - firstAvg > 5) {
      strengths.push(`Encouraging academic trajectory: recent homework scores have improved by ${Math.round(secondAvg - firstAvg)}% compared to early work.`);
      findings.push('Grade trajectory is positively accelerating.');
    } else if (firstAvg - secondAvg > 5) {
      concerns.push(`Negative performance trend: recent assignments show a decline of ${Math.round(firstAvg - secondAvg)}% from initial work.`);
      findings.push('Grade trajectory indicates recent decline in work quality.');
    }
  }

  // 3. Analyze attendance
  trace.push('[6. Analysis: Attendance] Running absence streak heuristics...');
  const absences = attendance.filter((a) => a.status === 'Absent');
  const tardies = attendance.filter((a) => a.status === 'Tardy');

  if (absences.length > 0) {
    trace.push(`[Attendance Alert] Detected ${absences.length} absences and ${tardies.length} tardies.`);
    if (absences.length >= 4) {
      concerns.push(`Severe absenteeism: missed ${absences.length} classes.`);
      findings.push(`Absence warning: ${absences.length} total absences across class sections.`);
      recommendations.push({
        action: 'Initiate attendance review and parent-guardian phone conference.',
        recommendedOwner: 'Advisor',
        urgency: 'High',
      });
    } else {
      findings.push(`Minor attendance issues: ${absences.length} absences and ${tardies.length} tardy records.`);
    }
  } else {
    strengths.push('Excellent classroom presence: perfect attendance recorded across logged dates.');
    trace.push('Perfect attendance detected. Flagged as strength.');
  }

  // 4. Incorporate Intervention status and Support Notes
  trace.push('[7. Analysis: Context] Scanning support notes and intervention plans...');
  const activeInterventions = interventionPlans.filter((p) => p.status === 'Active');
  
  if (activeInterventions.length > 0) {
    trace.push(`Active Intervention Plan detected: "${activeInterventions[0].summary}"`);
    findings.push(`Student is currently under active support: "${activeInterventions[0].summary}"`);
    recommendations.push({
      action: 'Conduct weekly progress check-in based on active academic plan.',
      recommendedOwner: 'Advisor',
      urgency: 'Medium',
    });
  }

  const academicNotes = supportNotes.filter((n) => n.noteType === 'Academic');
  if (academicNotes.length > 0) {
    trace.push(`Incorporated ${academicNotes.length} academic teacher notes into synthesis.`);
  }

  // 5. Generate Narrative Summary
  trace.push('[8. Synthesis] Compiling final narrative summary...');
  let summary = '';
  if (concerns.length >= 3) {
    summary = `Student ${studentName} is currently experiencing significant academic and engagement strain. While there are areas of strength, the combined effects of ${missingSubmissions.length} missing assignments and ${absences.length} absences require urgent coordinate intervention.`;
  } else if (concerns.length > 0) {
    summary = `Student ${studentName} is demonstrating stable overall progress but is showing localized vulnerabilities, particularly with some missing assignments or class absences. Targeted support will prevent escalation.`;
  } else {
    summary = `Student ${studentName} is demonstrating outstanding academic performance and exemplary engagement across all active courses. Maintain current strategies to continue this high standard of excellence.`;
  }

  // Standard recommendations if empty
  if (recommendations.length === 0) {
    recommendations.push({
      action: 'Maintain current positive academic support schedule.',
      recommendedOwner: 'Teacher',
      urgency: 'Low',
    });
  }

  trace.push('[9. Finalized] Synthesis completed successfully.');

  return {
    output: {
      summary,
      strengths,
      concerns,
      confidenceScore: Math.max(0.1, Math.round(confidenceScore * 100) / 100),
      findings,
      recommendations,
      limitations,
      metadata: {
        totalSubmissionsChecked: submissions.length,
        absencesChecked: absences.length,
        notesChecked: supportNotes.length,
      },
    },
    trace,
  };
}
