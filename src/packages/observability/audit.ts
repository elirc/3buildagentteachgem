import { db } from '@/db';
import { logger } from './logging';

export interface AuditEventInput {
  actorId: string; // The user doing the action
  action: string;  // e.g., 'student.create', 'submission.grade'
  entityType: string; // e.g., 'Student', 'Submission'
  entityId: string;
  before?: Record<string, any> | null;
  after?: Record<string, any> | null;
  metadata?: Record<string, any>;
}

/**
 * Records a transactional audit event into the database and issues an info log.
 * Helps teach junior engineers the value of tamper-evident history logs in enterprise applications.
 */
export async function recordAuditEvent(input: AuditEventInput): Promise<void> {
  const { actorId, action, entityType, entityId, before, after, metadata } = input;

  try {
    // 1. Write the audit event in the database
    await db.auditEvent.create({
      data: {
        actorId,
        action,
        entityType,
        entityId,
        beforeJSON: before ? JSON.stringify(before) : null,
        afterJSON: after ? JSON.stringify(after) : null,
        metadataJSON: metadata ? JSON.stringify(metadata) : null,
      },
    });

    // 2. Issue a structured log summarizing the action
    await logger.info({
      service: 'AuditService',
      message: `Audit: User [${actorId}] performed [${action}] on [${entityType}:${entityId}]`,
      entityType,
      entityId,
      userId: actorId,
      metadata: {
        action,
        actorId,
        hasBeforeState: !!before,
        hasAfterState: !!after,
      },
    });
  } catch (err) {
    // Graceful error logging to prevent breaking the active user transaction if audit fails
    console.error('⚠️ Critical observability error: Failed to record audit event:', err);
    await logger.error({
      service: 'AuditService',
      message: `Failed to record audit event for actor [${actorId}] action [${action}]: ${(err as Error).message}`,
      metadata: { error: (err as Error).stack },
    });
  }
}
