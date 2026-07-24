'use server';

import { cookies } from 'next/headers';
import { revalidatePath } from 'next/cache';
import { db } from '@/db';
import { runJob, enqueueJob } from '@/observability/jobs';
import { recordAuditEvent } from '@/observability/audit';
import { executeAgentRun } from '@/agents/core/orchestrator';
import { validateEnrollmentRules } from '@/domain/rules/enrollment';
import { AgentType, AgentTargetType } from '@/agents/core/types';

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
  return result;
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
  const runId = await executeAgentRun(params);
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
  const { studentId, classSectionId, actorId } = payload;

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

  // Schedule background Grade Recalculation job
  await enqueueJob('GradeRecalculation', { sectionId: classSectionId }, { classSectionId });

  revalidatePath('/sections/' + classSectionId);
  revalidatePath('/students/' + studentId);

  return { success: true, status: 'Enrolled' };
}

/**
 * 5. Drop Student Action
 */
export async function dropStudentAction(enrollmentId: string, actorId: string) {
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

  // Recalculate grades in background
  await enqueueJob('GradeRecalculation', { sectionId: enrollment.classSectionId }, { classSectionId: enrollment.classSectionId });

  revalidatePath('/sections/' + enrollment.classSectionId);
  revalidatePath('/students/' + enrollment.studentId);
}

/**
 * 6. Save/Grade Submission Action
 */
export async function saveGradeAction(payload: {
  submissionId: string;
  score: number;
  feedback: string;
  actorId: string;
}) {
  const { submissionId, score, feedback, actorId } = payload;
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

  // Record audit
  await recordAuditEvent({
    actorId,
    action: 'submission.grade',
    entityType: 'Submission',
    entityId: submissionId,
    before,
    after: submission,
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
  const { classSectionId, date, records, actorId } = payload;
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
 * 8. Create Support Note Action
 */
export async function createSupportNoteAction(payload: {
  studentId: string;
  authorId: string;
  visibility: string;
  noteType: string;
  content: string;
}) {
  const note = await db.supportNote.create({
    data: payload,
  });

  await recordAuditEvent({
    actorId: payload.authorId,
    action: 'supportNote.create',
    entityType: 'SupportNote',
    entityId: note.id,
    after: note,
  });

  revalidatePath('/students/' + payload.studentId);
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
  const plan = await db.interventionPlan.create({
    data: {
      studentId: payload.studentId,
      createdById: payload.createdById,
      status: 'Active',
      riskArea: payload.riskArea,
      summary: payload.summary,
      recommendedActions: payload.recommendedActions,
      followUpDate: new Date(payload.followUpDate),
    },
  });

  await recordAuditEvent({
    actorId: payload.createdById,
    action: 'intervention.create',
    entityType: 'InterventionPlan',
    entityId: plan.id,
    after: plan,
  });

  revalidatePath('/students/' + payload.studentId);
  revalidatePath('/interventions');
  return plan;
}
