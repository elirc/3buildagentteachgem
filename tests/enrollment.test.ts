import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  validateEnrollmentRules,
  type EnrollmentRuleInput,
} from '../src/packages/domain/rules/enrollment';

/** A registration that should succeed. Override one field per test. */
const valid: EnrollmentRuleInput = {
  studentStatus: 'Active',
  sectionStatus: 'Active',
  teacherStatus: 'Active',
  currentEnrollmentCount: 5,
  sectionCapacity: 20,
  hasExistingEnrollment: false,
};

const check = (overrides: Partial<EnrollmentRuleInput> = {}) =>
  validateEnrollmentRules({ ...valid, ...overrides });

describe('validateEnrollmentRules — the happy path', () => {
  test('an active student joins an active section with room', () => {
    const result = check();

    assert.equal(result.isValid, true);
    assert.equal(result.canWaitlist, false);
    assert.equal(result.reason, undefined);
  });

  test('a student on Probation may still enrol', () => {
    // Probation is a warning state, not a bar. Only Withdrawn and Graduated
    // block registration.
    assert.equal(check({ studentStatus: 'Probation' }).isValid, true);
  });

  test('a Planned section accepts enrolments', () => {
    // Only Cancelled and Completed are barred; Planned is a section that has
    // not started yet, which is exactly when you would register for it.
    assert.equal(check({ sectionStatus: 'Planned' }).isValid, true);
  });

  test('a teacher on leave does not block enrolment', () => {
    // Only Inactive blocks. OnLeave is temporary and the section still exists.
    assert.equal(check({ teacherStatus: 'OnLeave' }).isValid, true);
  });
});

describe('validateEnrollmentRules — each rejection', () => {
  const rejections: Array<[string, Partial<EnrollmentRuleInput>, string]> = [
    ['a duplicate enrolment', { hasExistingEnrollment: true }, 'already enrolled'],
    ['a withdrawn student', { studentStatus: 'Withdrawn' }, 'Withdrawn'],
    ['a graduated student', { studentStatus: 'Graduated' }, 'Graduated'],
    ['a cancelled section', { sectionStatus: 'Cancelled' }, 'cancelled'],
    ['a completed section', { sectionStatus: 'Completed' }, 'completed'],
    ['an inactive teacher', { teacherStatus: 'Inactive' }, 'inactive teacher'],
  ];

  for (const [label, overrides, expectedFragment] of rejections) {
    test(`rejects ${label} with no waitlist offer`, () => {
      const result = check(overrides);

      assert.equal(result.isValid, false);
      assert.equal(result.canWaitlist, false, 'only a capacity failure may offer a waitlist');
      assert.ok(
        result.reason?.includes(expectedFragment),
        `expected reason to mention "${expectedFragment}", got: ${result.reason}`
      );
    });
  }

  test('a full section is the ONLY failure that offers a waitlist', () => {
    const result = check({ currentEnrollmentCount: 20, sectionCapacity: 20 });

    assert.equal(result.isValid, false);
    assert.equal(result.canWaitlist, true);
    assert.ok(result.reason?.includes('full'));
  });

  test('over-capacity is treated the same as at-capacity', () => {
    // Data can drift past capacity (a capacity reduction, a bad import). The
    // rule uses >= rather than ===, so an over-full section still waitlists
    // instead of silently accepting more students.
    const result = check({ currentEnrollmentCount: 25, sectionCapacity: 20 });

    assert.equal(result.isValid, false);
    assert.equal(result.canWaitlist, true);
  });
});

describe('validateEnrollmentRules — gate ORDER', () => {
  /**
   * These are the tests that actually protect the rule. Any implementation can
   * reject a withdrawn student; the question is which reason it reports when
   * several failures apply at once. The order is a product decision — the user
   * should be told the blocking problem they can act on, not an incidental one.
   */

  test('a withdrawn student in a full section is rejected for being withdrawn', () => {
    const result = check({
      studentStatus: 'Withdrawn',
      currentEnrollmentCount: 20,
      sectionCapacity: 20,
    });

    assert.equal(result.isValid, false);
    // Crucially NOT true: offering a waitlist seat to someone who can never
    // occupy it would create a permanently stuck queue entry.
    assert.equal(result.canWaitlist, false);
    assert.ok(result.reason?.includes('Withdrawn'));
  });

  test('a duplicate enrolment outranks every other failure', () => {
    const result = check({
      hasExistingEnrollment: true,
      studentStatus: 'Withdrawn',
      sectionStatus: 'Cancelled',
      teacherStatus: 'Inactive',
      currentEnrollmentCount: 99,
    });

    assert.ok(result.reason?.includes('already enrolled'));
  });

  test('a cancelled section outranks an inactive teacher', () => {
    const result = check({ sectionStatus: 'Cancelled', teacherStatus: 'Inactive' });
    assert.ok(result.reason?.includes('cancelled'));
  });

  test('CHARACTERISATION: student eligibility is checked before section validity', () => {
    // A graduated student registering for a cancelled section hears about
    // their own status first. Debatable — the section problem affects everyone
    // and is arguably the more useful message — but pinned so a reorder is a
    // deliberate choice.
    const result = check({ studentStatus: 'Graduated', sectionStatus: 'Cancelled' });
    assert.ok(result.reason?.includes('Graduated'));
  });
});
