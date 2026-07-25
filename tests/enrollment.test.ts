import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  validateEnrollmentRules,
  selectWaitlistPromotion,
  type EnrollmentRuleInput,
  type WaitlistCandidate,
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

describe('selectWaitlistPromotion', () => {
  const candidate = (
    id: string,
    queuedAt: string,
    studentStatus = 'Active'
  ): WaitlistCandidate => ({
    enrollmentId: id,
    studentId: `student-${id}`,
    queuedAt: new Date(queuedAt),
    studentStatus,
  });

  const promote = (overrides: Partial<Parameters<typeof selectWaitlistPromotion>[0]> = {}) =>
    selectWaitlistPromotion({
      candidates: [],
      currentEnrollmentCount: 19,
      sectionCapacity: 20,
      sectionStatus: 'Active',
      ...overrides,
    });

  test('promotes the longest-waiting eligible student', () => {
    // Fairness is "longest wait wins" — the only ordering a student can verify
    // for themselves, and the only one that cannot be gamed by refreshing.
    const result = promote({
      candidates: [
        candidate('b', '2026-03-02T10:00:00Z'),
        candidate('a', '2026-03-01T09:00:00Z'),
        candidate('c', '2026-03-03T11:00:00Z'),
      ],
    });

    assert.equal(result.promote, true);
    assert.equal(result.promote && result.enrollmentId, 'a');
  });

  test('skips ineligible students instead of blocking the queue', () => {
    // A withdrawn student at the head of the queue must not freeze it. Blocking
    // would leave the seat empty forever and nobody behind them would advance.
    const result = promote({
      candidates: [
        candidate('withdrawn', '2026-01-01T00:00:00Z', 'Withdrawn'),
        candidate('graduated', '2026-01-02T00:00:00Z', 'Graduated'),
        candidate('active', '2026-03-01T00:00:00Z'),
      ],
    });

    assert.equal(result.promote, true);
    assert.equal(result.promote && result.enrollmentId, 'active');
  });

  test('does nothing when the waitlist is empty', () => {
    const result = promote({ candidates: [] });

    assert.equal(result.promote, false);
    assert.equal(result.promote === false && result.reason, 'Waitlist is empty.');
  });

  test('does nothing when every candidate is ineligible', () => {
    const result = promote({ candidates: [candidate('w', '2026-01-01T00:00:00Z', 'Withdrawn')] });

    assert.equal(result.promote, false);
    assert.ok(result.promote === false && result.reason.includes('No eligible'));
  });

  test('refuses to promote into a full section', () => {
    // The caller must recount AFTER the drop. Passing a stale count is the
    // classic bug here, and this is the guard that catches it.
    const result = promote({
      candidates: [candidate('a', '2026-01-01T00:00:00Z')],
      currentEnrollmentCount: 20,
      sectionCapacity: 20,
    });

    assert.equal(result.promote, false);
    assert.ok(result.promote === false && result.reason.includes('No seat'));
  });

  test('refuses to promote into a cancelled or completed section', () => {
    for (const sectionStatus of ['Cancelled', 'Completed']) {
      const result = promote({
        candidates: [candidate('a', '2026-01-01T00:00:00Z')],
        sectionStatus,
      });

      assert.equal(result.promote, false, `${sectionStatus} should not promote`);
    }
  });

  test('allows promotion into a Planned section', () => {
    // Planned sections accept enrolments (see validateEnrollmentRules), so
    // their waitlists must move too or the two rules would disagree.
    const result = promote({
      candidates: [candidate('a', '2026-01-01T00:00:00Z')],
      sectionStatus: 'Planned',
    });

    assert.equal(result.promote, true);
  });

  test('is deterministic when two students queued at the same instant', () => {
    // Same timestamp is realistic: a bulk import writes rows inside one
    // transaction. Without the id tie-break the winner would depend on row
    // order, and re-running could promote a different student.
    const sameInstant = '2026-03-01T09:00:00Z';
    const args = {
      candidates: [candidate('zzz', sameInstant), candidate('aaa', sameInstant)],
    };

    const first = promote(args);
    const second = promote(args);

    assert.equal(first.promote && first.enrollmentId, 'aaa');
    assert.deepEqual(first, second);
  });
});
