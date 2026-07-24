import { AgentOutput, AgentRecommendation } from '../core/types';
import { calculateTeacherWorkload } from '@/domain/rules/workload';

export interface TeacherWorkloadAgentInput {
  teacher: {
    id: string;
    firstName: string;
    lastName: string;
    department: string;
    employmentStatus: string;
  };
  activeSectionsCount: number;
  totalStudentsCapacity: number;
  ungradedSubmissionsCount: number;
  atRiskStudentsCount: number;
}

/**
 * Deterministic Teacher Workload Insight Agent.
 * Operates on our domain rules and synthesizes actionable staffing redistributions.
 */
export function runTeacherWorkloadInsightAgent(input: TeacherWorkloadAgentInput): {
  output: AgentOutput;
  trace: string[];
} {
  const trace: string[] = [];
  const { teacher, activeSectionsCount, totalStudentsCapacity, ungradedSubmissionsCount, atRiskStudentsCount } = input;
  const teacherName = `${teacher.firstName} ${teacher.lastName}`;

  trace.push(`[1. Init] Initializing Teacher Workload Agent for: "${teacherName}" (${teacher.department})`);
  trace.push(`[2. Gather Metrics] Sections: ${activeSectionsCount}, Seat Capacity: ${totalStudentsCapacity}, Ungraded Backlog: ${ungradedSubmissionsCount}, At-Risk Students on Roster: ${atRiskStudentsCount}`);

  const strengths: string[] = [];
  const concerns: string[] = [];
  const recommendations: AgentRecommendation[] = [];
  const limitations: string[] = [];
  let confidenceScore = 0.95;

  // 1. Invoke the core domain logic rule for Teacher Workload
  trace.push('[3. Domain Invoke] Invoking calculateTeacherWorkload domain rule...');
  const calculated = calculateTeacherWorkload({
    activeSectionsCount,
    totalStudentsCapacity,
    ungradedSubmissionsCount,
    atRiskStudentsCount,
    teacherStatus: teacher.employmentStatus,
  });

  trace.push(`Domain rule output: Workload Score = ${calculated.workloadScore}, Status = ${calculated.status}, Warnings = ${calculated.warnings.length}`);

  // Populate strengths/concerns from domain analysis
  if (calculated.workloadScore <= 45 && teacher.employmentStatus === 'Active') {
    strengths.push('High available teaching bandwidth: teacher is currently in an optimal workload tier.');
  }

  for (const warning of calculated.warnings) {
    if (warning.includes('leave') || warning.includes('Overloaded') || warning.includes('backlog') || warning.includes('pastoral')) {
      concerns.push(warning);
    }
  }

  // 2. Draft Agent Findings and Recommendations based on Workload Status
  trace.push(`[4. Heuristic: Staffing Analysis] Formulating staffing insight recommendations for status: [${calculated.status}]`);
  
  if (calculated.status === 'Critically Overloaded' || calculated.status === 'Overloaded') {
    recommendations.push({
      action: `Redistribute or assign assistant graders to help reduce "${teacherName}"'s grading backlog.`,
      recommendedOwner: 'Admin',
      urgency: 'High',
    });
    
    if (activeSectionsCount > 3) {
      recommendations.push({
        action: `Assign co-teacher or divide class sections for next academic term.`,
        recommendedOwner: 'Admin',
        urgency: 'Medium',
      });
    }
  } else if (calculated.status === 'Underloaded') {
    recommendations.push({
      action: `Available to absorb additional course assignments or cover class sections for leave absences.`,
      recommendedOwner: 'Admin',
      urgency: 'Low',
    });
  }

  if (ungradedSubmissionsCount >= 5) {
    recommendations.push({
      action: 'Teacher to allocate dedicated grading hours to clear backlog before weekly gradebook updates.',
      recommendedOwner: 'Teacher',
      urgency: 'Medium',
    });
  }

  if (recommendations.length === 0) {
    recommendations.push({
      action: 'Maintain current section distribution schedule.',
      recommendedOwner: 'Admin',
      urgency: 'Low',
    });
  }

  const summary = `Workload insight analysis for "${teacherName}". Calculated workload score is ${calculated.workloadScore}/100 (Workload status: ${calculated.status.toUpperCase()}). The educator's teaching capacity limits and grading backlogs are ${calculated.isOverloaded ? 'elevated' : 'well-balanced'}.`;

  trace.push('[5. Complete] Staffing workload analysis compiled.');

  return {
    output: {
      summary,
      strengths,
      concerns,
      confidenceScore,
      findings: calculated.warnings,
      recommendations,
      limitations,
      metadata: {
        workloadScore: calculated.workloadScore,
        workloadStatus: calculated.status,
        warningsCount: calculated.warnings.length,
      },
    },
    trace,
  };
}
