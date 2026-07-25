import { db } from '@/db';
import { logger } from './logging';
import { recordAuditEvent } from './audit';
import { calculateSectionGrade } from '@/domain/rules/grades';

export type JobType =
  | 'EmailNotification'
  | 'GradeRecalculation'
  | 'AttendanceSummary'
  | 'ReportGeneration'
  | 'EnrollmentSync'
  | 'GuardianDigest'
  | 'AgentRun';

export type JobStatus = 'Queued' | 'Running' | 'Succeeded' | 'Failed' | 'Retrying' | 'DeadLettered';

/**
 * The job lifecycle, written down.
 *
 * This map is documentation with teeth: it is the single place that answers
 * "can a job in state X move to state Y?". Before this existed the rules were
 * spread across runJob() and a `disabled` prop in the jobs page, and the two
 * disagreed — the page let you retry a DeadLettered job, which runJob happily
 * executed, pushing `attempts` past `maxAttempts`.
 *
 * Succeeded and DeadLettered are terminal. The only way out of DeadLettered is
 * an explicit human requeue, which resets the attempt budget.
 */
export const JOB_TRANSITIONS: Record<JobStatus, JobStatus[]> = {
  Queued: ['Running'],
  Running: ['Succeeded', 'Failed', 'DeadLettered'],
  Failed: ['Running'],
  Retrying: ['Running'],
  Succeeded: [],
  DeadLettered: ['Queued'], // requeue only
};

/** States a worker is allowed to pick up. */
export const RUNNABLE_STATUSES: JobStatus[] = ['Queued', 'Failed', 'Retrying'];

export function canRunJob(status: string): boolean {
  return RUNNABLE_STATUSES.includes(status as JobStatus);
}

/**
 * Enqueues a job in the database.
 */
export async function enqueueJob(
  type: JobType,
  payload: Record<string, any>,
  relations?: {
    studentId?: string;
    teacherId?: string;
    classSectionId?: string;
    assignmentId?: string;
  }
) {
  try {
    const job = await db.backgroundJob.create({
      data: {
        type,
        status: 'Queued',
        attempts: 0,
        maxAttempts: 3,
        payloadJSON: JSON.stringify(payload),
        studentId: relations?.studentId || null,
        teacherId: relations?.teacherId || null,
        classSectionId: relations?.classSectionId || null,
        assignmentId: relations?.assignmentId || null,
      },
    });

    await logger.info({
      service: 'JobQueue',
      message: `Enqueued background job [${job.id}] of type [${type}]`,
      entityType: 'BackgroundJob',
      entityId: job.id,
      metadata: { type, jobId: job.id },
    });

    return job;
  } catch (err) {
    console.error('⚠️ Failed to enqueue job:', err);
    throw err;
  }
}

/**
 * Moves a dead-lettered job back into the queue with a fresh attempt budget.
 *
 * This is deliberately a separate, explicit operation rather than a special case
 * inside runJob. A dead letter means "we gave up on this and a human must look
 * at it" — if the retry button could silently drain the dead-letter queue, the
 * queue would not be telling you anything. Requeue is the human saying "I have
 * looked, I believe the cause is fixed, try again."
 *
 * Note that it does NOT execute the job. Deciding to retry and actually
 * retrying are two different actions, and conflating them means an operator who
 * wanted to inspect the payload first has already run it.
 */
export async function requeueJob(jobId: string, actorId: string): Promise<{ success: boolean; reason?: string }> {
  const before = await db.backgroundJob.findUnique({ where: { id: jobId } });

  if (!before) {
    return { success: false, reason: `Job ${jobId} not found.` };
  }

  if (!JOB_TRANSITIONS[before.status as JobStatus]?.includes('Queued')) {
    await logger.warn({
      service: 'JobQueue',
      message: `Refusing to requeue job [${jobId}]: status [${before.status}] cannot transition to Queued`,
      entityType: 'BackgroundJob',
      entityId: jobId,
    });
    return { success: false, reason: `A job in status "${before.status}" cannot be requeued.` };
  }

  const after = await db.backgroundJob.update({
    where: { id: jobId },
    data: {
      status: 'Queued',
      attempts: 0,
      errorMessage: null,
      startedAt: null,
      finishedAt: null,
    },
  });

  await recordAuditEvent({
    actorId,
    action: 'job.requeue',
    entityType: 'BackgroundJob',
    entityId: jobId,
    before,
    after,
    metadata: { previousAttempts: before.attempts, previousError: before.errorMessage },
  });

  await logger.info({
    service: 'JobQueue',
    message: `Job [${jobId}] requeued by [${actorId}] after ${before.attempts} failed attempts`,
    entityType: 'BackgroundJob',
    entityId: jobId,
    userId: actorId,
  });

  return { success: true };
}

/**
 * Worker execution simulation.
 * Resolves a specific job ID by running the associated mock or real logic.
 */
export async function runJob(jobId: string): Promise<boolean> {
  const job = await db.backgroundJob.findUnique({
    where: { id: jobId },
  });

  if (!job) {
    throw new Error(`Job ${jobId} not found.`);
  }

  // Refuse work the state machine forbids. Returning false rather than throwing
  // keeps the existing boolean contract with retryJobAction: a UI that races the
  // worker should get "nothing happened", not a 500.
  if (!canRunJob(job.status)) {
    await logger.warn({
      service: 'BackgroundJobWorker',
      message: `Refusing to execute job [${job.id}]: status [${job.status}] is not runnable`,
      entityType: 'BackgroundJob',
      entityId: job.id,
      metadata: { status: job.status, runnable: RUNNABLE_STATUSES },
    });
    return false;
  }

  // Mark job as Running
  await db.backgroundJob.update({
    where: { id: jobId },
    data: {
      status: 'Running',
      attempts: { increment: 1 },
      startedAt: new Date(),
      errorMessage: null,
    },
  });

  await logger.info({
    service: 'BackgroundJobWorker',
    message: `Executing job [${job.id}] of type [${job.type}] (Attempt ${job.attempts + 1}/${job.maxAttempts})`,
    entityType: 'BackgroundJob',
    entityId: job.id,
  });

  try {
    const payload = JSON.parse(job.payloadJSON);

    // Simulate work based on Job Type
    switch (job.type) {
      case 'GradeRecalculation': {
        const { sectionId } = payload;
        if (!sectionId) throw new Error('Missing parameter: sectionId');

        // Real work! Fetch all student enrollments in the section and recalculate their final grades
        const enrollments = await db.enrollment.findMany({
          where: { classSectionId: sectionId, status: 'Enrolled' },
          include: { student: true },
        });

        for (const enroll of enrollments) {
          const submissions = await db.submission.findMany({
            where: { studentId: enroll.studentId, assignment: { classSectionId: sectionId } },
            include: { assignment: true },
          });

          const calculated = calculateSectionGrade(
            submissions.map((sub) => ({
              status: sub.status,
              score: sub.score,
              pointsPossible: sub.assignment.pointsPossible,
            }))
          );

          // Update the student enrollment finalGrade in the database
          await db.enrollment.update({
            where: { id: enroll.id },
            data: { finalGrade: calculated.percentage },
          });
        }
        break;
      }

      case 'AttendanceSummary': {
        const { sectionId, runDate } = payload;
        if (!sectionId) throw new Error('Missing parameter: sectionId');
        if (runDate === null || runDate === undefined) {
          // Trigger the exact seeded failure error for learning:
          throw new TypeError("Cannot read properties of null (reading 'toISOString') at attendanceSummaryJob (C:\\packages\\jobs\\attendance.ts:42:25)");
        }
        break;
      }

      case 'EmailNotification':
      case 'GuardianDigest':
      case 'ReportGeneration':
      case 'EnrollmentSync':
      case 'AgentRun':
        // Simulated latency
        await new Promise((resolve) => setTimeout(resolve, 500));
        break;

      default:
        throw new Error(`Unsupported job type: ${job.type}`);
    }

    // Mark as Succeeded
    await db.backgroundJob.update({
      where: { id: jobId },
      data: {
        status: 'Succeeded',
        finishedAt: new Date(),
      },
    });

    await logger.info({
      service: 'BackgroundJobWorker',
      message: `Job [${job.id}] completed successfully`,
      entityType: 'BackgroundJob',
      entityId: job.id,
    });

    return true;
  } catch (err) {
    const errorMsg = (err as Error).stack || (err as Error).message;
    const isDeadLetter = job.attempts + 1 >= job.maxAttempts;
    const nextStatus: JobStatus = isDeadLetter ? 'DeadLettered' : 'Failed';

    await db.backgroundJob.update({
      where: { id: jobId },
      data: {
        status: nextStatus,
        errorMessage: errorMsg,
        finishedAt: new Date(),
      },
    });

    await logger.error({
      service: 'BackgroundJobWorker',
      message: `Job [${job.id}] failed during execution: ${(err as Error).message}. Transitioned to status: [${nextStatus}]`,
      entityType: 'BackgroundJob',
      entityId: job.id,
      metadata: { error: errorMsg, attempts: job.attempts + 1 },
    });

    return false;
  }
}
