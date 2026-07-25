import type { Prisma } from '@prisma/client';
import type { ActiveSession } from './auth';

/**
 * Data scoping — which students a session is allowed to see.
 *
 * This is a different question from canPerformAction, and conflating the two is
 * the most common authorization mistake there is. Permissions answer "may this
 * role grade?"; scoping answers "whose work?". A Teacher may grade, but not
 * every student's; a Parent may view a profile, but only their own child's.
 *
 * The output is a Prisma WHERE fragment, not a filter function, and that is
 * deliberate. Fetching everything and then filtering in JavaScript "works"
 * until someone adds a `take`, a `count`, or an aggregate — at which point the
 * numbers are computed over rows the user was never allowed to see, and the
 * leak is a total that is silently too high. Push the constraint into the query
 * and it cannot be forgotten downstream.
 */

/** Roles that see the whole school. */
const UNSCOPED_ROLES = ['Admin', 'SchoolManager', 'Viewer'];

export function buildStudentScope(session: ActiveSession): Prisma.StudentWhereInput {
  switch (session.role) {
    case 'Admin':
    case 'SchoolManager':
    case 'Viewer':
      return {};

    case 'Teacher':
      // Students enrolled in a section this user teaches.
      //
      // Note it traverses teacher.userId rather than using session.profileId.
      // profileId is `student?.id || teacher?.id` (auth.ts), so for a user with
      // both profiles it silently resolves to the student one. Walking the
      // relation asks the question we actually mean.
      return {
        enrollments: {
          some: { classSection: { teacher: { userId: session.id } } },
        },
      };

    case 'Advisor':
      // Their advisees, plus anyone they have opened a plan for — an advisor
      // who wrote an intervention needs to keep seeing that student even if
      // the advisee assignment later moves.
      return {
        OR: [
          { advisorId: session.id },
          { interventionPlans: { some: { createdById: session.id } } },
        ],
      };

    case 'Student':
      return { userId: session.id };

    case 'Parent':
      // Email is the ONLY link between a guardian account and a student in this
      // schema — Student.guardianEmail is a free-text column with no relation.
      // It is fragile (case, typos, remarriage, two families sharing an
      // address) and should become a real guardianId relation. Documented
      // rather than papered over.
      return { guardianEmail: session.email };

    default:
      // Unknown role: see nothing. Failing closed is the only safe default for
      // a switch over a plain string column.
      return { id: '__no_access__' };
  }
}

export function isUnscopedRole(role: string): boolean {
  return UNSCOPED_ROLES.includes(role);
}

/**
 * Describes the current scope for the UI, so a short list does not look like
 * missing data. "Showing 1 of 4 students" with no explanation reads as a bug.
 */
export function describeStudentScope(session: ActiveSession): string | null {
  switch (session.role) {
    case 'Teacher':
      return 'Showing only students enrolled in sections you teach.';
    case 'Advisor':
      return 'Showing only your advisees and students you have opened a plan for.';
    case 'Student':
      return 'Showing only your own record.';
    case 'Parent':
      return 'Showing only students linked to your email address as guardian.';
    default:
      return null;
  }
}
