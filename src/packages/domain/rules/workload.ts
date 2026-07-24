export type WorkloadStatus = 'Underloaded' | 'Optimal' | 'Overloaded' | 'Critically Overloaded';

export interface TeacherWorkloadInput {
  activeSectionsCount: number;
  totalStudentsCapacity: number;
  ungradedSubmissionsCount: number;
  atRiskStudentsCount: number;
  teacherStatus: string; // 'Active', 'OnLeave', 'Inactive'
}

export interface WorkloadAnalysis {
  workloadScore: number;
  status: WorkloadStatus;
  warnings: string[];
  isOverloaded: boolean;
}

/**
 * Calculates a teacher's workload score and flags operational strain.
 */
export function calculateTeacherWorkload(input: TeacherWorkloadInput): WorkloadAnalysis {
  const {
    activeSectionsCount,
    totalStudentsCapacity,
    ungradedSubmissionsCount,
    atRiskStudentsCount,
    teacherStatus,
  } = input;

  const warnings: string[] = [];
  let score = 0;

  // 1. Inactive/Leave validations
  if (teacherStatus === 'Inactive') {
    warnings.push('Teacher profile is marked Inactive but is being evaluated for workload.');
    return { workloadScore: 0, status: 'Underloaded', warnings, isOverloaded: false };
  }
  if (teacherStatus === 'OnLeave') {
    warnings.push('Teacher is currently On Leave.');
    if (activeSectionsCount > 0) {
      warnings.push(`CRITICAL: Teacher is on leave but has ${activeSectionsCount} active class sections assigned.`);
      score += activeSectionsCount * 30; // High penalty for loading someone on leave
    }
  }

  // 2. Base Load from Active Sections (20 points per section)
  score += activeSectionsCount * 20;
  if (activeSectionsCount > 3) {
    warnings.push(`High course load: Managing ${activeSectionsCount} active class sections.`);
  }

  // 3. Class size impact (0.5 points per student capacity seat)
  score += totalStudentsCapacity * 0.5;
  if (totalStudentsCapacity > 60) {
    warnings.push(`Large student load: Total teaching capacity exceeds ${totalStudentsCapacity} seats.`);
  }

  // 4. Grading backlog penalty (2 points per ungraded submission)
  score += ungradedSubmissionsCount * 2.0;
  if (ungradedSubmissionsCount >= 5) {
    warnings.push(`Grading backlog warning: ${ungradedSubmissionsCount} submissions are awaiting grades.`);
  }

  // 5. At-Risk Student monitoring impact (5 points per at-risk student)
  score += atRiskStudentsCount * 5.0;
  if (atRiskStudentsCount >= 3) {
    warnings.push(`High pastoral support burden: ${atRiskStudentsCount} enrolled students are flagged At Risk or Critical.`);
  }

  // Ensure score is non-negative and rounded
  score = Math.max(0, Math.round(score));

  // Determine Workload Status
  let status: WorkloadStatus = 'Underloaded';
  if (score > 100) {
    status = 'Critically Overloaded';
  } else if (score > 75) {
    status = 'Overloaded';
  } else if (score >= 40) {
    status = 'Optimal';
  }

  const isOverloaded = status === 'Overloaded' || status === 'Critically Overloaded';

  if (isOverloaded) {
    warnings.push(`Teacher workload score is elevated at ${score} (Status: ${status}). Administrative redistribution is recommended.`);
  }

  return {
    workloadScore: score,
    status,
    warnings,
    isOverloaded,
  };
}
