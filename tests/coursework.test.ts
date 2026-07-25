import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { resolveSubmissionStatus, isPastDue } from '../src/packages/domain/rules/coursework';

const DUE = new Date('2026-05-01T23:59:00.000Z');
const BEFORE = new Date('2026-04-30T10:00:00.000Z');
const AFTER = new Date('2026-05-02T10:00:00.000Z');

const resolve = (overrides: Partial<Parameters<typeof resolveSubmissionStatus>[0]>) =>
  resolveSubmissionStatus({
    current: 'NotStarted',
    dueDate: DUE,
    submittedAt: null,
    now: AFTER,
    ...overrides,
  });

describe('resolveSubmissionStatus', () => {
  test('unstarted work past its due date becomes Missing', () => {
    // This transition feeds missingCount, and therefore every risk score in
    // the app. It is the reason this is a tested rule and not an inline `if`.
    assert.equal(resolve({ current: 'NotStarted', now: AFTER }), 'Missing');
  });

  test('unstarted work before its due date is left alone', () => {
    assert.equal(resolve({ current: 'NotStarted', now: BEFORE }), null);
  });

  test('work submitted after the deadline becomes Late', () => {
    assert.equal(
      resolve({ current: 'Submitted', submittedAt: new Date('2026-05-02T08:00:00.000Z') }),
      'Late'
    );
  });

  test('work submitted before the deadline stays Submitted', () => {
    assert.equal(
      resolve({ current: 'Submitted', submittedAt: new Date('2026-04-29T08:00:00.000Z') }),
      null
    );
  });

  test('lateness is judged by submission time, not by now', () => {
    // A submission handed in on time does not become late merely because it
    // has been sitting ungraded for a month.
    const wayLater = new Date('2026-09-01T00:00:00.000Z');
    assert.equal(
      resolve({
        current: 'Submitted',
        submittedAt: new Date('2026-04-29T08:00:00.000Z'),
        now: wayLater,
      }),
      null
    );
  });

  test('Graded and Returned work is never touched', () => {
    // A teacher's judgement outranks the sweep. Marking already-graded work
    // Missing would silently zero a real score.
    assert.equal(resolve({ current: 'Graded', now: AFTER }), null);
    assert.equal(resolve({ current: 'Returned', now: AFTER }), null);
  });

  test('already-Missing work is not rewritten', () => {
    // Returning null rather than 'Missing' is what makes the sweep idempotent:
    // the caller can count rows that genuinely need writing and skip the rest.
    assert.equal(resolve({ current: 'Missing', now: AFTER }), null);
  });

  test('already-Late work is not rewritten', () => {
    assert.equal(
      resolve({
        current: 'Late',
        submittedAt: new Date('2026-05-02T08:00:00.000Z'),
        now: AFTER,
      }),
      null
    );
  });

  test('Submitted with a null submittedAt is left alone rather than guessed at', () => {
    // The schema permits status='Submitted' with submittedAt=null. There is no
    // honest way to judge lateness without a timestamp, so the sweep declines.
    assert.equal(resolve({ current: 'Submitted', submittedAt: null, now: AFTER }), null);
  });

  test('exactly on the deadline is on time, not overdue', () => {
    // `>` vs `>=`. The difference between a student who submitted on the
    // stroke of the deadline being fine or being marked late — the kind of
    // off-by-one that produces complaints rather than bug reports.
    assert.equal(resolve({ current: 'NotStarted', now: new Date(DUE.getTime()) }), null);
    assert.equal(resolve({ current: 'NotStarted', now: new Date(DUE.getTime() + 1) }), 'Missing');
  });
});

describe('isPastDue', () => {
  test('is exclusive at the boundary', () => {
    assert.equal(isPastDue(new Date(DUE.getTime()), DUE), false);
    assert.equal(isPastDue(new Date(DUE.getTime() + 1), DUE), true);
    assert.equal(isPastDue(new Date(DUE.getTime() - 1), DUE), false);
  });
});
