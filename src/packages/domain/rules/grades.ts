export type GradeClassification = 'Excellent' | 'Good' | 'Warning' | 'At Risk';

/**
 * Classifies a percentage score into standard performance tiers.
 */
export function classifyGradeScore(percentage: number): GradeClassification {
  if (percentage >= 90) return 'Excellent';
  if (percentage >= 80) return 'Good';
  if (percentage >= 70) return 'Warning';
  return 'At Risk';
}

/**
 * Interface representing a student's submission in a section for grade calculation.
 */
export interface GradeSubmissionInput {
  status: string; // 'Submitted', 'Graded', 'Late', 'Missing', 'Returned'
  score: number | null;
  pointsPossible: number;
}

/**
 * Calculates a student's percentage grade and letter classification for a class section.
 * Missing assignments are computed as 0 points.
 * Draft assignments are not included.
 */
export function calculateSectionGrade(submissions: GradeSubmissionInput[]): {
  percentage: number;
  classification: GradeClassification;
  totalPointsPossible: number;
  totalPointsEarned: number;
  gradedCount: number;
  missingCount: number;
} {
  let totalPointsPossible = 0;
  let totalPointsEarned = 0;
  let gradedCount = 0;
  let missingCount = 0;

  for (const sub of submissions) {
    if (sub.status === 'Draft') continue; // Skip draft items

    totalPointsPossible += sub.pointsPossible;

    if (sub.status === 'Graded' || sub.status === 'Returned') {
      totalPointsEarned += sub.score ?? 0;
      gradedCount++;
    } else if (sub.status === 'Missing') {
      // Missing counts as 0 points earned, but counts toward total points possible
      totalPointsEarned += 0;
      missingCount++;
    } else {
      // If Submitted/Late but ungraded, we temporarily exclude it from completed points to avoid penalizing the student,
      // or treat it as ungraded. Let's exclude it from points earned but include in potential if graded.
      // To keep it simple: exclude ungraded items from calculation to be fair, OR count it.
      // Best practice: Only calculate based on items that have a due date in the past and are either graded or missing.
      // If it is just submitted but ungraded, we exclude it from both possible and earned so the student's grade
      // is based only on what has actually been graded or marked missing.
      totalPointsPossible -= sub.pointsPossible; 
    }
  }

  // Handle edge case of no assignments
  if (totalPointsPossible <= 0) {
    return {
      percentage: 100, // Default to 100% if nothing has been graded yet
      classification: 'Excellent',
      totalPointsPossible: 0,
      totalPointsEarned: 0,
      gradedCount,
      missingCount,
    };
  }

  const percentage = Math.round((totalPointsEarned / totalPointsPossible) * 1000) / 10; // Round to 1 decimal place

  return {
    percentage,
    classification: classifyGradeScore(percentage),
    totalPointsPossible,
    totalPointsEarned,
    gradedCount,
    missingCount,
  };
}

/**
 * Calculates the class average percentage for a section from multiple student averages.
 */
export function calculateClassAverage(studentPercentages: number[]): number {
  if (studentPercentages.length === 0) return 0;
  const total = studentPercentages.reduce((sum, p) => sum + p, 0);
  return Math.round((total / studentPercentages.length) * 10) / 10;
}
