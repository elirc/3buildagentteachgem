import { z } from 'zod';

/**
 * Validation schemas for the Server Action boundary.
 *
 * Why this file exists at all: SQLite has no enum type, so every status column
 * in this schema is a plain String with the legal values written in a comment.
 * Nothing in the database stops `status: 'Grded'` being written, and nothing
 * downstream will ever match it — the row simply stops appearing in filters and
 * counts. Validation at the boundary is the only place that can catch it.
 *
 * Server Actions are public POST endpoints. `required` and `min` attributes on
 * an <input> protect nobody: the form is not the only way to call them.
 *
 * NOTE: nothing here belongs in @/domain. The domain package imports nothing,
 * which is what makes it testable in milliseconds. Validation happens at the
 * edge; the domain trusts the values it is handed.
 */

/* ---------------------------------------------------------------- enums -- */
// Each mirrors the comment on the corresponding Prisma column. Keeping the two
// in one place is the point: a new status added to the schema and forgotten
// here becomes a rejected write rather than a silently unmatched row.

export const userRoleSchema = z.enum([
  'Admin',
  'SchoolManager',
  'Teacher',
  'Student',
  'Advisor',
  'Parent',
  'Viewer',
]);

export const enrollmentStatusSchema = z.enum(['Enrolled', 'Dropped', 'Completed', 'Waitlisted']);

export const submissionStatusSchema = z.enum([
  'NotStarted',
  'Submitted',
  'Late',
  'Missing',
  'Graded',
  'Returned',
]);

export const attendanceStatusSchema = z.enum(['Present', 'Absent', 'Tardy', 'Excused']);

export const noteVisibilitySchema = z.enum(['TeacherOnly', 'AdvisorOnly', 'AdminOnly', 'Shared']);

export const noteTypeSchema = z.enum([
  'Academic',
  'Attendance',
  'Behavior',
  'FamilyCommunication',
  'Other',
]);

export const riskAreaSchema = z.enum(['Grades', 'Attendance', 'Engagement', 'Behavior', 'Other']);

export const employmentStatusSchema = z.enum(['Active', 'OnLeave', 'Inactive']);

export const assignmentTypeSchema = z.enum([
  'Homework',
  'Quiz',
  'Exam',
  'Project',
  'Discussion',
  'Lab',
  'Other',
]);

export const agentTypeSchema = z.enum([
  'StudentProgressSummary',
  'AtRiskStudentDetection',
  'AssignmentFeedback',
  'AttendanceAnomaly',
  'TeacherWorkloadInsight',
]);

export const agentTargetTypeSchema = z.enum([
  'Student',
  'Teacher',
  'ClassSection',
  'Assignment',
  'Submission',
  'LogGroup',
  'Job',
]);

// The TypeScript unions are DERIVED from the schemas rather than written twice.
// Two hand-maintained copies of the same list drift; this pair cannot.
export type UserRole = z.infer<typeof userRoleSchema>;
export type EnrollmentStatus = z.infer<typeof enrollmentStatusSchema>;
export type SubmissionStatus = z.infer<typeof submissionStatusSchema>;
export type AttendanceStatus = z.infer<typeof attendanceStatusSchema>;
export type NoteVisibility = z.infer<typeof noteVisibilitySchema>;
export type NoteType = z.infer<typeof noteTypeSchema>;

/* ------------------------------------------------------------ primitives -- */

/** A UUID from our own database. Loose on format, strict on emptiness. */
const id = z.string().min(1, 'An identifier is required.');

/**
 * A date arriving as a form string.
 *
 * `new Date('nonsense')` does not throw — it returns a Date whose time is NaN.
 * An instanceof check passes and the invalid value flows all the way into
 * Prisma. The refine is what actually catches it.
 */
const dateFromInput = z
  .string()
  .min(1, 'A date is required.')
  .refine((v) => !Number.isNaN(new Date(v).getTime()), 'Not a valid date.');

/* --------------------------------------------------------------- inputs -- */

export const enrollStudentInput = z.object({
  studentId: id,
  classSectionId: id,
  actorId: id,
});

export const dropStudentInput = z.object({
  enrollmentId: id,
  actorId: id,
});

export const saveGradeInput = z.object({
  submissionId: id,
  // coerce because FormData yields strings. The upper bound against
  // pointsPossible cannot live here — zod cannot know it — so that check stays
  // in the action, where the assignment has been loaded.
  score: z.coerce.number({ invalid_type_error: 'Score must be a number.' })
    .min(0, 'Score cannot be negative.'),
  feedback: z.string().min(1, 'Feedback is required.'),
  actorId: id,
  agentRunId: z.string().optional(),
  acceptedDraftVerbatim: z.boolean().optional(),
});

export const recordAttendanceInput = z.object({
  classSectionId: id,
  date: dateFromInput,
  records: z
    .array(
      z.object({
        studentId: id,
        status: attendanceStatusSchema,
        notes: z.string().optional(),
      })
    )
    .min(1, 'An attendance sheet needs at least one student.'),
  actorId: id,
});

export const createSupportNoteInput = z.object({
  studentId: id,
  authorId: id,
  visibility: noteVisibilitySchema,
  noteType: noteTypeSchema,
  content: z.string().min(1, 'A note cannot be empty.'),
});

export const createInterventionInput = z.object({
  studentId: id,
  createdById: id,
  riskArea: riskAreaSchema,
  summary: z.string().min(1, 'A plan needs a summary.'),
  recommendedActions: z.string().min(1, 'A plan needs at least one action.'),
  followUpDate: dateFromInput,
});

export const createAssignmentInput = z.object({
  classSectionId: id,
  title: z.string().min(1, 'Title is required.').max(200, 'Title must be 200 characters or fewer.'),
  description: z.string(),
  type: assignmentTypeSchema,
  pointsPossible: z.coerce
    .number({ invalid_type_error: 'Points must be a number.' })
    .positive('Points possible must be greater than zero.'),
  dueDate: dateFromInput,
  actorId: id,
});

export const updateTeacherStatusInput = z.object({
  teacherId: id,
  employmentStatus: employmentStatusSchema,
  actorId: id,
});

export const runAgentInput = z.object({
  agentType: agentTypeSchema,
  targetType: agentTargetTypeSchema,
  targetId: id,
  createdById: id,
});

/* --------------------------------------------------------------- parsing -- */

/**
 * Parses input, or throws an Error whose message is safe to show a user.
 *
 * A raw ZodError stringifies to a JSON dump of issue objects. Next.js renders a
 * thrown Server Action error straight into the UI, so without this the user
 * would see the library's internals.
 */
export function parseInput<T extends z.ZodTypeAny>(schema: T, value: unknown): z.infer<T> {
  const result = schema.safeParse(value);

  if (!result.success) {
    const message = result.error.issues
      .map((issue) => {
        const path = issue.path.join('.');
        return path ? `${path}: ${issue.message}` : issue.message;
      })
      .join(' ');

    throw new Error(message || 'The submitted data was not valid.');
  }

  return result.data;
}
