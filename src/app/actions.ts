'use server';

import { cookies } from 'next/headers';
import { revalidatePath } from 'next/cache';
import { db } from '@/db';
import { getActiveUser } from '@/shared/auth';
import { runJob, enqueueJob, requeueJob, processQueue } from '@/observability/jobs';
import { recordAuditEvent } from '@/observability/audit';
import { logger } from '@/observability/logging';
import { executeAgentRun } from '@/agents/core/orchestrator';
import { validateEnrollmentRules, selectWaitlistPromotion } from '@/domain/rules/enrollment';
import {
  validateAssignmentInput,
  validateAssignmentTransition,
} from '@/domain/rules/assignments';
import { AgentType, AgentTargetType } from '@/agents/core/types';
import {
  parseInput,
  enrollStudentInput,
  dropStudentInput,
  saveGradeInput,
  recordAttendanceInput,
  createSupportNoteInput,
  createInterventionInput,
  createAssignmentInput,
  updateTeacherStatusInput,
  runAgentInput,
} from '@/shared/schemas';

/**
 * 1. Simulates Authentication Switcher
 */
export async function switchUserAction(userId: string) {
  cookies().set('mock_user_id', userId, { path: '/' });
  revalidatePath('/');
}

/**
 * 2. Background Job Retry Action
 */
export async function retryJobAction(jobId: string) {
  const result = await runJob(jobId);
  revalidatePath('/jobs');
  revalidatePath('/jobs/' + jobId);
  revalidatePath('/');
  return result;
}

/**
 * 2b. Requeue a dead-lettered job (resets the attempt budget, does not execute).
 */
export async function requeueJobAction(jobId: string) {
  const session = await getActiveUser();
  const result = await requeueJob(jobId, session.id);
  revalidatePath('/jobs');
  revalidatePath('/');
  return result;
}

/**
 * 2c. Drain the job queue.
 *
 * In production this is a worker process on a timer, not a button. The button
 * exists so the queue is observable: you can watch a job move Queued -> Running
 * -> Succeeded and see the grades change as a result.
 */
export async function processQueueAction() {
  const summary = await processQueue();
  revalidatePath('/jobs');
  revalidatePath('/');
  revalidatePath('/students');
  revalidatePath('/sections');
  return summary;
}

/**
 * 2d. Enqueue a coursework sweep.
 *
 * Enqueued rather than executed inline: the sweep touches every overdue
 * assignment in the school, and a request handler is the wrong place for
 * unbounded work. It runs when the queue is drained, like everything else.
 */
export async function enqueueCourseworkSweepAction() {
  const session = await getActiveUser();
  const job = await enqueueJob('CourseworkSweep', { requestedBy: session.id, requestedAt: new Date().toISOString() });
  revalidatePath('/jobs');
  return { jobId: job.id };
}

/**
 * 3. Run Mock Agent Action
 */
export async function runAgentAction(params: {
  agentType: AgentType;
  targetType: AgentTargetType;
  targetId: string;
  createdById: string;
}) {
  const input = parseInput(runAgentInput, params);
  const runId = await executeAgentRun(input);
  revalidatePath('/');
  revalidatePath('/agent-runs');
  revalidatePath('/agent-runs/' + runId);
  return runId;
}

/**
 * 4. Enroll Student Action
 */
export async function enrollStudentAction(payload: {
  studentId: string;
  classSectionId: string;
  actorId: string;
}) {
  const { studentId, classSectionId, actorId } = parseInput(enrollStudentInput, payload);

  // Fetch all facts for the enrollment domain validation rules
  const student = await db.student.findUniqueOrThrow({ where: { id: studentId } });
  const section = await db.classSection.findUniqueOrThrow({
    where: { id: classSectionId },
    include: { course: true, teacher: true },
  });
  
  const currentCount = await db.enrollment.count({
    where: { classSectionId, status: 'Enrolled' },
  });

  const existing = await db.enrollment.findUnique({
    where: { studentId_classSectionId: { studentId, classSectionId } },
  });

  // Invoke domain logic rules
  const validation = validateEnrollmentRules({
    studentStatus: student.enrollmentStatus,
    sectionStatus: section.status,
    teacherStatus: section.teacher.employmentStatus,
    currentEnrollmentCount: currentCount,
    sectionCapacity: section.capacity,
    hasExistingEnrollment: !!existing,
  });

  if (!validation.isValid) {
    // If full and waitlist is available, let's offer waitlist option
    if (validation.canWaitlist) {
      const waitlistRecord = await db.enrollment.create({
        data: {
          studentId,
          classSectionId,
          status: 'Waitlisted',
        },
      });

      await recordAuditEvent({
        actorId,
        action: 'enrollment.waitlist',
        entityType: 'Enrollment',
        entityId: waitlistRecord.id,
        after: waitlistRecord,
      });

      revalidatePath('/sections/' + classSectionId);
      revalidatePath('/students/' + studentId);
      return { success: true, status: 'Waitlisted', message: 'Class was full. Enrolled student on the Waitlist.' };
    }

    throw new Error(validation.reason || 'Enrollment rejected by domain rules.');
  }

  // Create enrollment
  const enrollment = await db.enrollment.create({
    data: {
      studentId,
      classSectionId,
      status: 'Enrolled',
    },
  });

  // Record audit trail
  await recordAuditEvent({
    actorId,
    action: 'enrollment.create',
    entityType: 'Enrollment',
    entityId: enrollment.id,
    after: enrollment,
  });

  // Backfill submission rows for work that was already published before this
  // student joined. Without this, a late joiner has no row for those
  // assignments and is invisible in the gradebook — not "missing", just absent
  // from the grid, which is a much harder bug to notice than a red cell.
  const publishedAssignments = await db.assignment.findMany({
    where: { classSectionId, status: { in: ['Published', 'Closed'] } },
    select: { id: true },
  });

  if (publishedAssignments.length > 0) {
    // Prisma's `skipDuplicates` is NOT supported on SQLite, so the de-duplication
    // is done explicitly: read what already exists, then insert only the gap.
    // Slightly more code, but it also makes the intent visible instead of hiding
    // it in a flag.
    const existing = await db.submission.findMany({
      where: { studentId, assignmentId: { in: publishedAssignments.map((a) => a.id) } },
      select: { assignmentId: true },
    });
    const alreadyHas = new Set(existing.map((e) => e.assignmentId));
    const missing = publishedAssignments.filter((a) => !alreadyHas.has(a.id));

    if (missing.length > 0) {
      await db.submission.createMany({
        data: missing.map((a) => ({
          assignmentId: a.id,
          studentId,
          status: 'NotStarted',
        })),
      });
    }
  }

  // Schedule background Grade Recalculation job
  await enqueueJob('GradeRecalculation', { sectionId: classSectionId }, { classSectionId });

  revalidatePath('/sections/' + classSectionId);
  revalidatePath('/students/' + studentId);

  return { success: true, status: 'Enrolled' };
}

/**
 * 5. Drop Student Action
 */
export async function dropStudentAction(enrollmentIdRaw: string, actorIdRaw: string) {
  const { enrollmentId, actorId } = parseInput(dropStudentInput, {
    enrollmentId: enrollmentIdRaw,
    actorId: actorIdRaw,
  });

  const before = await db.enrollment.findUniqueOrThrow({ where: { id: enrollmentId } });

  const enrollment = await db.enrollment.update({
    where: { id: enrollmentId },
    data: {
      status: 'Dropped',
      droppedAt: new Date(),
    },
  });

  await recordAuditEvent({
    actorId,
    action: 'enrollment.drop',
    entityType: 'Enrollment',
    entityId: enrollmentId,
    before,
    after: enrollment,
  });

  // A seat just freed up. Offer it to the waitlist before anything else can
  // take it.
  await promoteFromWaitlist(enrollment.classSectionId, actorId);

  // Recalculate grades in background
  await enqueueJob('GradeRecalculation', { sectionId: enrollment.classSectionId }, { classSectionId: enrollment.classSectionId });

  revalidatePath('/sections/' + enrollment.classSectionId);
  revalidatePath('/students/' + enrollment.studentId);
}

/**
 * 5b. Give a freed seat to the longest-waiting eligible student.
 *
 * Shared by the automatic path (a drop) and the manual "Promote" button, so
 * both routes apply identical fairness rules. Two code paths for one decision
 * is how a queue quietly becomes unfair.
 */
export async function promoteFromWaitlist(classSectionId: string, actorId: string) {
  const section = await db.classSection.findUniqueOrThrow({ where: { id: classSectionId } });

  // Recount AFTER the drop has been committed. Reusing a count captured before
  // the mutation is the classic bug in this function: it makes the section look
  // full and silently skips the promotion.
  const currentEnrollmentCount = await db.enrollment.count({
    where: { classSectionId, status: 'Enrolled' },
  });

  const waitlisted = await db.enrollment.findMany({
    where: { classSectionId, status: 'Waitlisted' },
    include: { student: { select: { id: true, enrollmentStatus: true } } },
  });

  const decision = selectWaitlistPromotion({
    candidates: waitlisted.map((w) => ({
      enrollmentId: w.id,
      studentId: w.studentId,
      studentStatus: w.student.enrollmentStatus,
      // createdAt is when the waitlist row was written, i.e. when they queued.
      queuedAt: w.createdAt,
    })),
    currentEnrollmentCount,
    sectionCapacity: section.capacity,
    sectionStatus: section.status,
  });

  if (!decision.promote) {
    await logger.info({
      service: 'EnrollmentService',
      message: `No waitlist promotion for section [${classSectionId}]: ${decision.reason}`,
      entityType: 'ClassSection',
      entityId: classSectionId,
    });
    return { promoted: false, reason: decision.reason };
  }

  const beforeRow = waitlisted.find((w) => w.id === decision.enrollmentId);

  // UPDATE the existing waitlist row — never create a new Enrollment.
  // @@unique([studentId, classSectionId]) means a second row is impossible, and
  // trying would surface as a constraint violation instead of a promotion.
  const promoted = await db.enrollment.update({
    where: { id: decision.enrollmentId },
    data: { status: 'Enrolled', enrolledAt: new Date() },
  });

  await recordAuditEvent({
    actorId,
    action: 'enrollment.promote',
    entityType: 'Enrollment',
    entityId: decision.enrollmentId,
    before: beforeRow,
    after: promoted,
    metadata: { seatsBefore: currentEnrollmentCount, capacity: section.capacity },
  });

  await enqueueJob(
    'EmailNotification',
    { studentId: decision.studentId, classSectionId, reason: 'waitlist-promotion' },
    { classSectionId, studentId: decision.studentId }
  );
  await enqueueJob('GradeRecalculation', { sectionId: classSectionId }, { classSectionId });

  revalidatePath('/sections/' + classSectionId);
  revalidatePath('/students/' + decision.studentId);

  return { promoted: true, studentId: decision.studentId };
}

/**
 * 5c. Manual promotion trigger for the section roster UI.
 */
export async function promoteWaitlistAction(classSectionId: string) {
  const session = await getActiveUser();
  return promoteFromWaitlist(classSectionId, session.id);
}

/**
 * 6. Save/Grade Submission Action
 */
export async function saveGradeAction(payload: {
  submissionId: string;
  score: number;
  feedback: string;
  actorId: string;
  /** Set when the teacher had an agent draft on screen while grading. */
  agentRunId?: string;
  /** True when the submitted feedback is byte-identical to the agent's draft. */
  acceptedDraftVerbatim?: boolean;
}) {
  const { submissionId, score, feedback, actorId, agentRunId, acceptedDraftVerbatim } =
    parseInput(saveGradeInput, payload);
  const before = await db.submission.findUniqueOrThrow({
    where: { id: submissionId },
    include: { assignment: true },
  });

  if (score > before.assignment.pointsPossible) {
    throw new Error(`Grade score cannot exceed points possible (${before.assignment.pointsPossible}).`);
  }

  const submission = await db.submission.update({
    where: { id: submissionId },
    data: {
      score,
      feedback,
      status: 'Graded',
      gradedById: actorId,
      gradedAt: new Date(),
    },
  });

  // Record audit.
  //
  // The agent metadata is the point of recording it at all: it distinguishes
  // "a human wrote this feedback", "a human edited the agent's draft" and "a
  // human clicked accept". Without it there is no way to answer later whether
  // the assistance was actually useful — you would only know an agent ran.
  await recordAuditEvent({
    actorId,
    action: 'submission.grade',
    entityType: 'Submission',
    entityId: submissionId,
    before,
    after: submission,
    metadata: agentRunId
      ? { agentRunId, feedbackAcceptedVerbatim: !!acceptedDraftVerbatim }
      : undefined,
  });

  // Trigger background job to recalculate the student averages in the class section
  await enqueueJob('GradeRecalculation', { sectionId: before.assignment.classSectionId }, { classSectionId: before.assignment.classSectionId });

  revalidatePath('/sections/' + before.assignment.classSectionId);
  revalidatePath('/sections/' + before.assignment.classSectionId + '/gradebook');
  revalidatePath('/students/' + submission.studentId);
  revalidatePath('/assignments/' + before.assignmentId);

  return submission;
}

/**
 * 7. Record Attendance Action
 */
export async function recordAttendanceAction(payload: {
  classSectionId: string;
  date: string;
  records: Array<{ studentId: string; status: string; notes?: string }>;
  actorId: string;
}) {
  const { classSectionId, date, records, actorId } = parseInput(recordAttendanceInput, payload);
  const targetDate = new Date(date);

  for (const item of records) {
    const before = await db.attendance.findUnique({
      where: {
        studentId_classSectionId_date: {
          studentId: item.studentId,
          classSectionId,
          date: targetDate,
        },
      },
    });

    const attendance = await db.attendance.upsert({
      where: {
        studentId_classSectionId_date: {
          studentId: item.studentId,
          classSectionId,
          date: targetDate,
        },
      },
      create: {
        studentId: item.studentId,
        classSectionId,
        date: targetDate,
        status: item.status,
        notes: item.notes || null,
        recordedById: actorId,
      },
      update: {
        status: item.status,
        notes: item.notes || null,
        recordedById: actorId,
      },
    });

    await recordAuditEvent({
      actorId,
      action: before ? 'attendance.update' : 'attendance.record',
      entityType: 'Attendance',
      entityId: attendance.id,
      before: before || undefined,
      after: attendance,
    });
  }

  // Trigger an asynchronous attendance consolidation report generate alert
  await enqueueJob('AttendanceSummary', { sectionId: classSectionId, runDate: date }, { classSectionId });

  revalidatePath('/sections/' + classSectionId);
  revalidatePath('/sections/' + classSectionId + '/attendance');
  revalidatePath('/students');
  return { success: true };
}

/**
 * 7b. Create Assignment (always starts as a Draft)
 */
export async function createAssignmentAction(payload: {
  classSectionId: string;
  title: string;
  description: string;
  type: string;
  pointsPossible: number;
  dueDate: string;
  actorId: string;
}) {
  const input = parseInput(createAssignmentInput, payload);
  const dueDate = new Date(input.dueDate);

  // Zod checked shape and type; the domain rule still owns the business
  // meaning. Belt and braces on the two questions that are genuinely different:
  // "is this well-formed?" and "is this allowed?".
  const validation = validateAssignmentInput({
    title: input.title,
    type: input.type,
    pointsPossible: input.pointsPossible,
    dueDate,
  });

  if (!validation.isValid) {
    throw new Error(validation.errors.join(' '));
  }

  // New assignments are always Drafts. Creating and publishing are separate
  // decisions: publishing is the irreversible one, because it fans out
  // submission rows to the whole roster.
  const assignment = await db.assignment.create({
    data: {
      classSectionId: input.classSectionId,
      title: input.title.trim(),
      description: input.description,
      type: input.type,
      status: 'Draft',
      dueDate,
      pointsPossible: input.pointsPossible,
      createdById: input.actorId,
    },
  });

  await recordAuditEvent({
    actorId: input.actorId,
    action: 'assignment.create',
    entityType: 'Assignment',
    entityId: assignment.id,
    after: assignment,
  });

  revalidatePath('/sections/' + input.classSectionId);
  return assignment;
}

/**
 * 7c. Publish an Assignment — the fan-out step.
 */
export async function publishAssignmentAction(assignmentId: string, actorId: string) {
  const before = await db.assignment.findUniqueOrThrow({ where: { id: assignmentId } });

  const transition = validateAssignmentTransition(before.status, 'Published');
  if (!transition.isValid) {
    throw new Error(transition.reason || 'Illegal assignment transition.');
  }

  // Only currently-enrolled students get a submission row. Waitlisted and
  // dropped students are deliberately excluded: a waitlisted student has no
  // seat, and creating work for someone who may never join the section would
  // show up in their missing-assignment count.
  const roster = await db.enrollment.findMany({
    where: { classSectionId: before.classSectionId, status: 'Enrolled' },
    select: { studentId: true },
  });

  const assignment = await db.assignment.update({
    where: { id: assignmentId },
    data: { status: 'Published' },
  });

  // Prisma's `skipDuplicates` is not available on SQLite, so existing rows are
  // filtered out explicitly. The transition rule already blocks a second
  // publish, but this makes the fan-out safe to re-run if a publish ever dies
  // half-way — belt and braces on the one irreversible step.
  const existing = await db.submission.findMany({
    where: { assignmentId },
    select: { studentId: true },
  });
  const alreadyHas = new Set(existing.map((e) => e.studentId));
  const toCreate = roster.filter((r) => !alreadyHas.has(r.studentId));

  if (toCreate.length > 0) {
    await db.submission.createMany({
      data: toCreate.map((r) => ({
        assignmentId,
        studentId: r.studentId,
        status: 'NotStarted',
      })),
    });
  }

  await recordAuditEvent({
    actorId,
    action: 'assignment.publish',
    entityType: 'Assignment',
    entityId: assignmentId,
    before,
    after: assignment,
    metadata: { submissionsCreated: roster.length },
  });

  await enqueueJob(
    'EmailNotification',
    { assignmentId, studentIds: roster.map((r) => r.studentId), title: assignment.title },
    { classSectionId: before.classSectionId, assignmentId }
  );

  revalidatePath('/sections/' + before.classSectionId);
  revalidatePath('/sections/' + before.classSectionId + '/gradebook');
  return { success: true, submissionsCreated: roster.length };
}

/**
 * 7d. Close an Assignment (stops accepting work; grading continues).
 */
export async function closeAssignmentAction(assignmentId: string, actorId: string) {
  const before = await db.assignment.findUniqueOrThrow({ where: { id: assignmentId } });

  const transition = validateAssignmentTransition(before.status, 'Closed');
  if (!transition.isValid) {
    throw new Error(transition.reason || 'Illegal assignment transition.');
  }

  const assignment = await db.assignment.update({
    where: { id: assignmentId },
    data: { status: 'Closed' },
  });

  await recordAuditEvent({
    actorId,
    action: 'assignment.close',
    entityType: 'Assignment',
    entityId: assignmentId,
    before,
    after: assignment,
  });

  revalidatePath('/sections/' + before.classSectionId);
  return assignment;
}

/**
 * 7e. Update a teacher's employment status.
 *
 * Not cosmetic: validateEnrollmentRules refuses any enrolment into a section
 * whose teacher is Inactive, so this flag can silently close registration for
 * every class they own. The audit event is what makes that traceable later.
 */
export async function updateTeacherStatusAction(payload: {
  teacherId: string;
  employmentStatus: string;
  actorId: string;
}) {
  const input = parseInput(updateTeacherStatusInput, payload);

  const before = await db.teacher.findUniqueOrThrow({ where: { id: input.teacherId } });

  const teacher = await db.teacher.update({
    where: { id: input.teacherId },
    data: { employmentStatus: input.employmentStatus },
  });

  const liveSections = await db.classSection.count({
    where: { teacherId: input.teacherId, status: 'Active' },
  });

  await recordAuditEvent({
    actorId: input.actorId,
    action: 'teacher.status.change',
    entityType: 'Teacher',
    entityId: input.teacherId,
    before,
    after: teacher,
    metadata: { liveSectionsAtChange: liveSections },
  });

  revalidatePath('/teachers');
  revalidatePath('/teachers/' + input.teacherId);
  return teacher;
}

/**
 * 8. Create Support Note Action
 */
export async function createSupportNoteAction(payload: {
  studentId: string;
  authorId: string;
  visibility: string;
  noteType: string;
  content: string;
}) {
  const input = parseInput(createSupportNoteInput, payload);

  const note = await db.supportNote.create({
    data: input,
  });

  await recordAuditEvent({
    actorId: input.authorId,
    action: 'supportNote.create',
    entityType: 'SupportNote',
    entityId: note.id,
    after: note,
  });

  revalidatePath('/students/' + input.studentId);
  return note;
}

/**
 * 9. Create Intervention Plan Action
 */
export async function createInterventionPlanAction(payload: {
  studentId: string;
  createdById: string;
  riskArea: string;
  summary: string;
  recommendedActions: string;
  followUpDate: string;
}) {
  const input = parseInput(createInterventionInput, payload);

  const plan = await db.interventionPlan.create({
    data: {
      studentId: input.studentId,
      createdById: input.createdById,
      status: 'Active',
      riskArea: input.riskArea,
      summary: input.summary,
      recommendedActions: input.recommendedActions,
      followUpDate: new Date(input.followUpDate),
    },
  });

  await recordAuditEvent({
    actorId: input.createdById,
    action: 'intervention.create',
    entityType: 'InterventionPlan',
    entityId: plan.id,
    after: plan,
  });

  revalidatePath('/students/' + input.studentId);
  revalidatePath('/interventions');
  return plan;
}
