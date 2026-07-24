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
