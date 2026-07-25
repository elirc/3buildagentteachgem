export interface CourseworkSweepInput {
  current: string;
  dueDate: Date;
  submittedAt: Date | null;
  /**
   * The clock, passed in rather than read.
   *
   * A rule that calls new Date() internally can only be tested by waiting, or
   * by mocking global time. Taking `now` as an argument makes "what happens one
   * millisecond before the deadline" a one-line test.
   */
  now: Date;
}

/** Statuses a sweep must never touch: a human has already judged this work. */
const TERMINAL_STATUSES = ['Graded', 'Returned'];

/**
 * Decides the new status for one submission, or null when nothing should change.
 *
 * Returning null rather than the current status is what makes the sweep
 * idempotent and cheap: the caller can count "rows that actually need writing"
 * and skip the update entirely on a second run.
 *
 * All comparisons are in UTC, because that is what a JS Date compares in.
 * "Overdue at 23:59" therefore means 23:59 UTC, not the school's local
 * midnight. For a real deployment the due date needs a timezone; stating the
 * assumption is the honest version of not solving it here.
 */
export function resolveSubmissionStatus(input: CourseworkSweepInput): string | null {
  const { current, dueDate, submittedAt, now } = input;

  // A teacher's judgement outranks any automated sweep.
  if (TERMINAL_STATUSES.includes(current)) return null;

  const isOverdue = now.getTime() > dueDate.getTime();

  // Work that was never started and is now past due is Missing. This is the
  // transition that feeds missingCount, and therefore every risk score in the
  // app — which is why it is a rule with tests rather than an inline condition.
  if (current === 'NotStarted' && isOverdue) return 'Missing';

  // Submitted after the deadline is Late. Checked against the submission's own
  // timestamp, not against `now`: lateness is a property of when the student
  // handed it in, and does not grow while the work sits ungraded.
  if (current === 'Submitted' && submittedAt && submittedAt.getTime() > dueDate.getTime()) {
    return 'Late';
  }

  return null;
}

/**
 * Exactly on the deadline is ON TIME.
 *
 * Exported so the boundary is stated once and can be asserted directly. `>`
 * versus `>=` here is the difference between a student who submitted on the
 * stroke of the deadline being fine or being marked late, and that is the kind
 * of off-by-one that generates complaints rather than bug reports.
 */
export function isPastDue(now: Date, dueDate: Date): boolean {
  return now.getTime() > dueDate.getTime();
}
