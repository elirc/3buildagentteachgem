export interface EnrollmentRuleInput {
  studentStatus: string; // 'Active', 'Probation', 'Withdrawn', 'Graduated'
  sectionStatus: string; // 'Planned', 'Active', 'Completed', 'Cancelled'
  teacherStatus: string; // 'Active', 'OnLeave', 'Inactive'
  currentEnrollmentCount: number;
  sectionCapacity: number;
  hasExistingEnrollment: boolean;
}

export interface EnrollmentValidationResult {
  isValid: boolean;
  canWaitlist: boolean;
  reason?: string;
}

export interface WaitlistCandidate {
  enrollmentId: string;
  studentId: string;
  studentStatus: string;
  queuedAt: Date;
}

export interface WaitlistPromotionInput {
  candidates: WaitlistCandidate[];
  currentEnrollmentCount: number;
  sectionCapacity: number;
  sectionStatus: string;
}

export type WaitlistPromotionResult =
  | { promote: true; enrollmentId: string; studentId: string }
  | { promote: false; reason: string };

/**
 * Chooses who gets a freed seat.
 *
 * Fairness here is "longest wait wins", which is the only ordering a student
 * can verify for themselves and the only one that cannot be gamed by refreshing
 * a page. Ties are broken by enrollmentId so the result is deterministic — two
 * students queued in the same transaction must not swap places between calls.
 *
 * Ineligible candidates are SKIPPED rather than blocking the queue. A withdrawn
 * student sitting at the head of the waitlist would otherwise freeze it
 * permanently: the seat stays empty and the next person never advances.
 */
export function selectWaitlistPromotion(input: WaitlistPromotionInput): WaitlistPromotionResult {
  const { candidates, currentEnrollmentCount, sectionCapacity, sectionStatus } = input;

  if (sectionStatus !== 'Active' && sectionStatus !== 'Planned') {
    return { promote: false, reason: `Section is ${sectionStatus}; promotions are not applicable.` };
  }

  if (currentEnrollmentCount >= sectionCapacity) {
    return { promote: false, reason: 'No seat is free.' };
  }

  if (candidates.length === 0) {
    return { promote: false, reason: 'Waitlist is empty.' };
  }

  const eligible = candidates
    .filter((c) => c.studentStatus !== 'Withdrawn' && c.studentStatus !== 'Graduated')
    .sort((a, b) => {
      const byQueue = a.queuedAt.getTime() - b.queuedAt.getTime();
      return byQueue !== 0 ? byQueue : a.enrollmentId.localeCompare(b.enrollmentId);
    });

  if (eligible.length === 0) {
    return { promote: false, reason: 'No eligible students on the waitlist.' };
  }

  return { promote: true, enrollmentId: eligible[0].enrollmentId, studentId: eligible[0].studentId };
}

/**
 * Validates whether a student can enroll in a class section based on domain rules.
 */
export function validateEnrollmentRules(input: EnrollmentRuleInput): EnrollmentValidationResult {
  const {
    studentStatus,
    sectionStatus,
    teacherStatus,
    currentEnrollmentCount,
    sectionCapacity,
    hasExistingEnrollment,
  } = input;

  // 1. Prevent duplicate enrollment
  if (hasExistingEnrollment) {
    return {
      isValid: false,
      canWaitlist: false,
      reason: 'Student is already enrolled or waitlisted in this class section.',
    };
  }

  // 2. Student eligibility checks
  if (studentStatus === 'Withdrawn') {
    return {
      isValid: false,
      canWaitlist: false,
      reason: 'Withdrawn students cannot receive new enrollments.',
    };
  }
  if (studentStatus === 'Graduated') {
    return {
      isValid: false,
      canWaitlist: false,
      reason: 'Graduated students cannot receive new enrollments.',
    };
  }

  // 3. Section status checks
  if (sectionStatus === 'Cancelled') {
    return {
      isValid: false,
      canWaitlist: false,
      reason: 'Cannot enroll in a cancelled class section.',
    };
  }
  if (sectionStatus === 'Completed') {
    return {
      isValid: false,
      canWaitlist: false,
      reason: 'Cannot enroll in a completed class section.',
    };
  }

  // 4. Teacher eligibility checks
  if (teacherStatus === 'Inactive') {
    return {
      isValid: false,
      canWaitlist: false,
      reason: 'Class section has an inactive teacher assigned.',
    };
  }

  // 5. Section capacity enforcement
  if (currentEnrollmentCount >= sectionCapacity) {
    return {
      isValid: false,
      canWaitlist: true,
      reason: `Class section is full (Capacity: ${sectionCapacity}/${sectionCapacity}). Waitlist is available.`,
    };
  }

  return {
    isValid: true,
    canWaitlist: false,
  };
}
