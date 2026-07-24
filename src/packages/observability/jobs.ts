import { db } from '@/db';
import { logger } from './logging';
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
