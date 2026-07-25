export type AssignmentStatus = 'Draft' | 'Published' | 'Closed';

export const ASSIGNMENT_TYPES = [
  'Homework',
  'Quiz',
  'Exam',
  'Project',
  'Discussion',
  'Lab',
  'Other',
] as const;

export type AssignmentType = (typeof ASSIGNMENT_TYPES)[number];

/**
 * The assignment lifecycle.
 *
 * Draft     — being written. Invisible to students. No submission rows exist.
 * Published — live. Every enrolled student has a submission row.
 * Closed    — no longer accepting work. Grades remain editable.
 *
 * Closed is terminal, and that is load-bearing rather than tidiness. Publishing
 * creates one Submission per enrolled student, and Submission carries
 * @@unique([assignmentId, studentId]). A Closed -> Published transition would
 * attempt that fan-out a second time and collide on the constraint. Forbidding
 * the transition is how the rule protects the invariant instead of relying on a
 * database error to do it.
 */
export const ASSIGNMENT_TRANSITIONS: Record<AssignmentStatus, AssignmentStatus[]> = {
  Draft: ['Published'],
  Published: ['Closed'],
  Closed: [],
};

export interface TransitionResult {
  isValid: boolean;
  reason?: string;
}

export function validateAssignmentTransition(from: string, to: AssignmentStatus): TransitionResult {
  const allowed = ASSIGNMENT_TRANSITIONS[from as AssignmentStatus];

  if (!allowed) {
    return { isValid: false, reason: `Unknown assignment status "${from}".` };
  }

  if (!allowed.includes(to)) {
    return {
      isValid: false,
      reason: allowed.length === 0
        ? `A ${from} assignment is final and cannot be changed.`
        : `A ${from} assignment can only move to: ${allowed.join(', ')}.`,
    };
  }

  return { isValid: true };
}

export interface AssignmentInput {
  title: string;
  type: string;
  pointsPossible: number;
  dueDate: Date;
}

export interface AssignmentValidationResult {
  isValid: boolean;
  errors: string[];
}

/**
 * Validates assignment content at the boundary.
 *
 * `now` is a parameter rather than a call to new Date() inside, so that a test
 * can pin the clock. A rule that reads the wall clock internally is a rule you
 * can only test by waiting.
 */
export function validateAssignmentInput(input: AssignmentInput): AssignmentValidationResult {
  const errors: string[] = [];

  if (!input.title || input.title.trim().length === 0) {
    errors.push('Title is required.');
  } else if (input.title.trim().length > 200) {
    errors.push('Title must be 200 characters or fewer.');
  }

  if (!ASSIGNMENT_TYPES.includes(input.type as AssignmentType)) {
    errors.push(`Type must be one of: ${ASSIGNMENT_TYPES.join(', ')}.`);
  }

  // Zero-point assignments would make calculateSectionGrade divide by a
  // denominator this assignment contributes nothing to — harmless today, but it
  // also means "graded out of 0", which no gradebook can render sensibly.
  if (!Number.isFinite(input.pointsPossible) || input.pointsPossible <= 0) {
    errors.push('Points possible must be greater than zero.');
  }

  if (!(input.dueDate instanceof Date) || Number.isNaN(input.dueDate.getTime())) {
    errors.push('A valid due date is required.');
  }

  return { isValid: errors.length === 0, errors };
}
