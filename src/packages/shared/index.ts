// UserRole is derived from the zod enum rather than declared twice. Two
// hand-maintained copies of one list drift; a derived type cannot.
export type { UserRole } from './schemas';
export * from './schemas';

import type { UserRole } from './schemas';

export const USER_ROLES: UserRole[] = [
  'Admin',
  'SchoolManager',
  'Teacher',
  'Student',
  'Advisor',
  'Parent',
  'Viewer',
];

/* ------------------------------------------------------------------------- *
 * Permissions
 *
 * One table. Every gate in the app resolves through canPerformAction, so
 * changing who may do something is a one-line edit here rather than a hunt
 * through fifteen files.
 *
 * PermissionAction is a union rather than `string` on purpose. With a bare
 * string, a typo like 'submision.grade' silently falls through to `default:
 * return false` and locks everyone out except Admin — a permission bug that
 * looks exactly like a deliberate restriction. As a union it is a compile
 * error.
 * ------------------------------------------------------------------------- */

export const PERMISSION_ACTIONS = [
  // Academic administration
  'course.create',
  'section.create',
  'student.create',
  'teacher.create',
  'teacher.status.change',
  // Enrolment
  'enrollment.manage',
  'enrollment.promote',
  // Coursework and grading
  'assignment.manage',
  'submission.grade',
  'attendance.record',
  // Pastoral care
  'supportNote.create',
  'intervention.create',
  'intervention.complete',
  // Operations
  'job.retry',
  'job.requeue',
  'job.process',
  'logs.view',
  'permissions.view',
  // Agents
  'agent.run.student',
  'agent.run.teacher',
  'agent.run.attendance',
  'agent.run.feedback',
  // Shared reads
  'dashboard.view',
  'student.profile.view',
] as const;

export type PermissionAction = (typeof PERMISSION_ACTIONS)[number];

/**
 * Which roles may perform each action, excluding Admin.
 *
 * Admin is handled by a short-circuit below rather than being listed 24 times.
 * That is a real trade-off: it keeps the table readable, but it also means the
 * table alone does not tell you the whole truth. describeAllowedRoles() exists
 * so the UI never has to reimplement that nuance.
 */
const PERMISSION_MATRIX: Record<PermissionAction, UserRole[]> = {
  'course.create': ['SchoolManager'],
  'section.create': ['SchoolManager'],
  'student.create': ['SchoolManager'],
  'teacher.create': ['SchoolManager'],
  'teacher.status.change': ['SchoolManager'],

  'enrollment.manage': ['SchoolManager'],
  'enrollment.promote': ['SchoolManager'],

  'assignment.manage': ['SchoolManager', 'Teacher'],
  'submission.grade': ['SchoolManager', 'Teacher'],
  'attendance.record': ['SchoolManager', 'Teacher'],

  'supportNote.create': ['SchoolManager', 'Teacher', 'Advisor'],
  'intervention.create': ['SchoolManager', 'Advisor'],
  'intervention.complete': ['SchoolManager', 'Advisor'],

  'job.retry': ['SchoolManager'],
  'job.requeue': ['SchoolManager'],
  'job.process': ['SchoolManager'],
  'logs.view': ['SchoolManager'],
  'permissions.view': [],

  'agent.run.student': ['SchoolManager', 'Teacher', 'Advisor'],
  'agent.run.teacher': ['SchoolManager'],
  'agent.run.attendance': ['SchoolManager', 'Teacher'],
  'agent.run.feedback': ['SchoolManager', 'Teacher'],

  // Everyone may open a dashboard. WHAT they see is a data-scoping question,
  // not an action-gating one — see buildStudentScope.
  'dashboard.view': ['SchoolManager', 'Teacher', 'Advisor', 'Student', 'Parent', 'Viewer'],
  'student.profile.view': ['SchoolManager', 'Teacher', 'Advisor', 'Student', 'Parent', 'Viewer'],
};

export function canPerformAction(role: string, action: PermissionAction): boolean {
  const currentRole = role as UserRole;
  if (!USER_ROLES.includes(currentRole)) return false;

  // Admin bypasses everything.
  if (currentRole === 'Admin') return true;

  return PERMISSION_MATRIX[action]?.includes(currentRole) ?? false;
}

/**
 * Every role that may perform an action, Admin included.
 *
 * Used by the lock messages and the /permissions matrix so neither has to
 * hardcode prose that can drift from the table. A "🔒 Admin only" label that
 * lies is worse than no label.
 */
export function describeAllowedRoles(action: PermissionAction): UserRole[] {
  return USER_ROLES.filter((role) => canPerformAction(role, action));
}

/** Human-readable lock text, derived rather than written. */
export function lockMessage(action: PermissionAction): string {
  const roles = describeAllowedRoles(action);
  if (roles.length === 0) return '🔒 This action is disabled.';
  return `🔒 Requires one of: ${roles.join(', ')}.`;
}

/* ------------------------------------------------------------------------- *
 * JSON column helpers
 *
 * Several columns in this schema store structured data as a JSON *string*
 * (scheduleJSON, subjectsJSON, payloadJSON, ...). SQLite has no JSON column
 * type, so the database cannot validate any of it — a row can legally contain
 * "null", "{}", "not json at all", or an array of the wrong shape.
 *
 * That makes parsing a trust boundary. Every parser below returns an empty
 * array rather than throwing, because a malformed schedule on one section must
 * never take down the whole sections page.
 * ------------------------------------------------------------------------- */

export interface ScheduleSlot {
  day: string;
  time: string;
}

const DAY_ABBREVIATIONS: Record<string, string> = {
  monday: 'Mon',
  tuesday: 'Tue',
  wednesday: 'Wed',
  thursday: 'Thu',
  friday: 'Fri',
  saturday: 'Sat',
  sunday: 'Sun',
};

export const SCHEDULE_DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'];

/**
 * Parses a ClassSection.scheduleJSON string into slots.
 * Returns [] for null, empty, malformed, or wrongly-shaped input.
 */
export function parseSchedule(json: string | null | undefined): ScheduleSlot[] {
  if (!json) return [];

  try {
    const parsed = JSON.parse(json);

    // JSON.parse('"hello"') succeeds and returns a string, and JSON.parse('{}')
    // returns an object. Neither is iterable in the way we need, so check the
    // shape rather than trusting that parsing succeeded.
    if (!Array.isArray(parsed)) return [];

    return parsed
      .filter((slot): slot is ScheduleSlot =>
        slot !== null &&
        typeof slot === 'object' &&
        typeof slot.day === 'string' &&
        typeof slot.time === 'string'
      )
      .map((slot) => ({ day: slot.day, time: slot.time }));
  } catch {
    return [];
  }
}

/**
 * Parses a Teacher.subjectsJSON string into a list of subject tags.
 */
export function parseSubjects(json: string | null | undefined): string[] {
  if (!json) return [];

  try {
    const parsed = JSON.parse(json);
    if (!Array.isArray(parsed)) return [];

    return parsed
      .filter((s): s is string => typeof s === 'string')
      .map((s) => s.trim())
      .filter((s) => s.length > 0);
  } catch {
    return [];
  }
}

/**
 * Renders slots for display: "Mon 10:00-11:30 · Wed 10:00-11:30".
 */
export function formatSchedule(slots: ScheduleSlot[]): string {
  if (slots.length === 0) return 'Not scheduled';

  return slots
    .map((slot) => `${DAY_ABBREVIATIONS[slot.day.toLowerCase()] ?? slot.day} ${slot.time}`)
    .join(' · ');
}

/**
 * Turns a comma-separated form field into the JSON string the column expects.
 */
export function serializeSubjects(raw: string | null | undefined): string {
  if (!raw) return JSON.stringify([]);

  const subjects = raw
    .split(',')
    .map((s) => s.trim())
    .filter((s) => s.length > 0);

  return JSON.stringify(subjects);
}

/**
 * Builds scheduleJSON from paired day/time form fields, dropping incomplete rows.
 */
export function serializeSchedule(pairs: Array<{ day: string | null; time: string | null }>): string {
  const slots = pairs
    .filter((p) => p.day && p.time && p.day.trim() && p.time.trim())
    .map((p) => ({ day: (p.day as string).trim(), time: (p.time as string).trim() }));

  return JSON.stringify(slots);
}

/**
 * Beautifully formats a Date object or string for display in UI grids and reports.
 */
export function formatDate(dateVal: Date | string | number | null): string {
  if (!dateVal) return 'N/A';
  const d = new Date(dateVal);
  if (isNaN(d.getTime())) return 'N/A';

  return d.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

export function formatDateTime(dateVal: Date | string | number | null): string {
  if (!dateVal) return 'N/A';
  const d = new Date(dateVal);
  if (isNaN(d.getTime())) return 'N/A';

  return d.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
}

/**
 * Maps database risk levels to modern CSS semantic color tokens.
 */
export function getRiskBadgeStyle(level: string): { bg: string; text: string } {
  switch (level) {
    case 'Critical':
      return { bg: 'var(--color-risk-critical-bg)', text: 'var(--color-risk-critical-text)' };
    case 'High':
      return { bg: 'var(--color-risk-high-bg)', text: 'var(--color-risk-high-text)' };
    case 'Medium':
      return { bg: 'var(--color-risk-medium-bg)', text: 'var(--color-risk-medium-text)' };
    default:
      return { bg: 'var(--color-risk-low-bg)', text: 'var(--color-risk-low-text)' };
  }
}

/**
 * Maps database attendance statuses to CSS class tokens.
 */
export function getAttendanceStatusStyle(status: string): string {
  switch (status) {
    case 'Present':
      return 'badge-success';
    case 'Absent':
      return 'badge-danger';
    case 'Tardy':
      return 'badge-warning';
    case 'Excused':
      return 'badge-info';
    default:
      return 'badge-neutral';
  }
}
