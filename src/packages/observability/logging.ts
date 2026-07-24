import { db } from '@/db';

export type LogLevel = 'debug' | 'info' | 'warn' | 'error' | 'fatal';

export interface LogPayload {
  message: string;
  service: string;
  requestId?: string;
  userId?: string;
  entityType?: string;
  entityId?: string;
  metadata?: Record<string, any>;
}

/**
 * Generates a stable fingerprint for a log message by replacing dynamic parts
 * like emails, UUIDs, numbers, and request IDs with placeholders.
 */
export function generateFingerprint(message: string, service: string): string {
  let cleaned = message.toLowerCase();

  // Replace UUIDs / GUIDs
  cleaned = cleaned.replace(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/g, '{uuid}');

  // Replace emails
  cleaned = cleaned.replace(/[\w-\.]+@([\w-]+\.)+[\w-]{2,4}/g, '{email}');

  // Replace numerical IDs / long numbers
  cleaned = cleaned.replace(/\b\d{4,}\b/g, '{number}');

  // Combine with service name to separate service-specific errors
  return `${service}:${cleaned.substring(0, 100)}`;
}

class Logger {
  private async writeLog(level: LogLevel, payload: LogPayload) {
    const { message, service, requestId, userId, entityType, entityId, metadata } = payload;
    const fingerprint = generateFingerprint(message, service);

    // Print to standard console for local stdout collection
    const logString = `[${new Date().toISOString()}] [${level.toUpperCase()}] [${service}] [Req:${requestId || 'none'}]: ${message}`;
    if (level === 'error' || level === 'fatal') {
      console.error(logString);
    } else if (level === 'warn') {
      console.warn(logString);
    } else {
      console.log(logString);
    }

    try {
      // Persist log into the database so it's queryable in the Log Explorer
      await db.systemLog.create({
        data: {
          level,
          service,
          message,
          requestId: requestId || null,
          userId: userId || null,
          entityType: entityType || null,
          entityId: entityId || null,
          metadataJSON: metadata ? JSON.stringify(metadata) : '{}',
          fingerprint,
          environment: process.env.NODE_ENV || 'development',
        },
      });
    } catch (dbError) {
      // Fallback in case DB is down or client is not generated yet
      console.error('⚠️ Failed to persist system log to database:', dbError);
    }
  }

  public async debug(payload: LogPayload) {
    if (process.env.NODE_ENV !== 'production') {
      await this.writeLog('debug', payload);
    }
  }

  public async info(payload: LogPayload) {
    await this.writeLog('info', payload);
  }

  public async warn(payload: LogPayload) {
    await this.writeLog('warn', payload);
  }

  public async error(payload: LogPayload) {
    await this.writeLog('error', payload);
  }

  public async fatal(payload: LogPayload) {
    await this.writeLog('fatal', payload);
  }
}

export const logger = new Logger();
export default logger;
