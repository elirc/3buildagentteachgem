import { db } from '@/db';
import { logger } from './logging';

export type NotificationKind =
  | 'AgentRecommendation'
  | 'JobDeadLettered'
  | 'InterventionFollowUp'
  | 'System';

export interface CreateNotificationInput {
  userId: string;
  kind: NotificationKind;
  urgency: string;
  title: string;
  body: string;
  linkPath?: string;
  entityType?: string;
  entityId?: string;
  dedupeKey: string;
}

/**
 * The single write path for notifications.
 *
 * upsert on @@unique([userId, dedupeKey]) gives idempotency for free: the same
 * alert produced twice updates one row instead of creating two. That matters
 * because the producers below run inside operations users repeat — re-running
 * an agent must not re-notify five people.
 *
 * Fail-open, following the precedent recordAuditEvent sets. A notification is
 * an aside; if writing one throws, the agent run or job that produced it must
 * still complete. Losing an alert is bad, failing the work that generated it
 * is worse.
 */
export async function createNotification(input: CreateNotificationInput): Promise<void> {
  try {
    await db.notification.upsert({
      where: { userId_dedupeKey: { userId: input.userId, dedupeKey: input.dedupeKey } },
      create: {
        userId: input.userId,
        kind: input.kind,
        urgency: input.urgency,
        title: input.title,
        body: input.body,
        linkPath: input.linkPath ?? null,
        entityType: input.entityType ?? null,
        entityId: input.entityId ?? null,
        dedupeKey: input.dedupeKey,
      },
      update: {
        // Refresh the content but deliberately do NOT clear readAt. Marking an
        // alert unread again because the same condition still holds is how a
        // notification centre becomes noise people stop opening.
        title: input.title,
        body: input.body,
        urgency: input.urgency,
      },
    });
  } catch (err) {
    await logger.error({
      service: 'NotificationService',
      message: `Failed to create notification for user [${input.userId}]: ${(err as Error).message}`,
      metadata: { dedupeKey: input.dedupeKey },
    });
  }
}

/**
 * A time bucket for dedupe keys.
 *
 * Without this, the unique constraint would suppress a genuine repeat of the
 * same alert forever — a student who becomes critical again next month would
 * never be flagged, because "we already told you" was recorded once in March.
 */
export function dayBucket(date = new Date()): string {
  return date.toISOString().slice(0, 10);
}

/**
 * Maps an agent's `recommendedOwner` to real user ids.
 *
 * The agents speak in roles ("Advisor should call home"), and roles are not
 * people. This is where that gap gets closed — and where it is admitted when
 * it cannot be: an unroutable owner is logged and dropped rather than silently
 * disappearing, because "the alert went nowhere" is a fact someone needs.
 */
export async function resolveRecipients(
  owner: string,
  context: { studentId?: string; teacherId?: string }
): Promise<string[]> {
  switch (owner) {
    case 'Admin': {
      const admins = await db.user.findMany({
        where: { role: { in: ['Admin', 'SchoolManager'] } },
        select: { id: true },
      });
      return admins.map((a) => a.id);
    }

    case 'Advisor': {
      if (!context.studentId) return [];
      const student = await db.student.findUnique({
        where: { id: context.studentId },
        select: { advisorId: true },
      });
      // Fall back to every advisor when the student has none assigned, rather
      // than dropping a High-urgency escalation on the floor.
      if (student?.advisorId) return [student.advisorId];

      const advisors = await db.user.findMany({ where: { role: 'Advisor' }, select: { id: true } });
      return advisors.map((a) => a.id);
    }

    case 'Teacher': {
      if (!context.studentId) return [];
      // Every teacher who currently teaches this student.
      const enrollments = await db.enrollment.findMany({
        where: { studentId: context.studentId, status: 'Enrolled' },
        select: { classSection: { select: { teacher: { select: { userId: true } } } } },
      });
      return [
        ...new Set(
          enrollments
            .map((e) => e.classSection.teacher.userId)
            .filter((id): id is string => !!id)
        ),
      ];
    }

    case 'Student': {
      if (!context.studentId) return [];
      const student = await db.student.findUnique({
        where: { id: context.studentId },
        select: { userId: true },
      });
      return student?.userId ? [student.userId] : [];
    }

    case 'Guardian': {
      if (!context.studentId) return [];
      const student = await db.student.findUnique({
        where: { id: context.studentId },
        select: { guardianEmail: true },
      });
      if (!student?.guardianEmail) return [];
      // Guardian accounts are linked only by email — the same fragile join
      // documented in scope.ts. Called out here too rather than hidden.
      const guardians = await db.user.findMany({
        where: { email: student.guardianEmail, role: 'Parent' },
        select: { id: true },
      });
      return guardians.map((g) => g.id);
    }

    default:
      return [];
  }
}

/**
 * Fans an agent run's High/Critical recommendations out to the people who own
 * them. Low and Medium are deliberately not notified — an inbox that fires on
 * "consider a routine check-in" is an inbox nobody reads.
 */
export async function notifyAgentRecommendations(params: {
  runId: string;
  agentType: string;
  targetType: string;
  targetId: string;
  recommendations: Array<{ action: string; recommendedOwner: string; urgency: string }>;
  subjectName?: string;
}): Promise<void> {
  const urgent = params.recommendations.filter(
    (r) => r.urgency === 'High' || r.urgency === 'Critical'
  );
  if (urgent.length === 0) return;

  const context =
    params.targetType === 'Student'
      ? { studentId: params.targetId }
      : params.targetType === 'Teacher'
        ? { teacherId: params.targetId }
        : {};

  const bucket = dayBucket();

  for (const rec of urgent) {
    const recipients = await resolveRecipients(rec.recommendedOwner, context);

    if (recipients.length === 0) {
      await logger.warn({
        service: 'NotificationService',
        message: `Unroutable recommendation owner [${rec.recommendedOwner}] for ${params.targetType}:${params.targetId} — alert dropped`,
        entityType: 'AgentRun',
        entityId: params.runId,
        metadata: { action: rec.action, urgency: rec.urgency },
      });
      continue;
    }

    for (const userId of recipients) {
      await createNotification({
        userId,
        kind: 'AgentRecommendation',
        urgency: rec.urgency,
        title: `${rec.urgency} — ${params.agentType.replace(/([A-Z])/g, ' $1').trim()}`,
        body: params.subjectName ? `${params.subjectName}: ${rec.action}` : rec.action,
        linkPath: `/agent-runs/${params.runId}`,
        entityType: 'AgentRun',
        entityId: params.runId,
        // The action text is part of the key so two different urgent
        // recommendations from one run do not collapse into a single alert.
        dedupeKey: `agentrec:${params.targetId}:${rec.action.slice(0, 60)}:${bucket}`,
      });
    }
  }
}

/** Tells the people who can act about a job that exhausted its retry budget. */
export async function notifyDeadLetter(job: { id: string; type: string; errorMessage: string | null }) {
  const admins = await resolveRecipients('Admin', {});

  for (const userId of admins) {
    await createNotification({
      userId,
      kind: 'JobDeadLettered',
      urgency: 'High',
      title: `Job dead-lettered: ${job.type}`,
      body: job.errorMessage
        ? job.errorMessage.split('\n')[0].slice(0, 200)
        : 'The job exhausted its retry budget.',
      linkPath: '/jobs',
      entityType: 'BackgroundJob',
      entityId: job.id,
      // Keyed on the job id alone: a specific job dead-letters once.
      dedupeKey: `deadletter:${job.id}`,
    });
  }
}
