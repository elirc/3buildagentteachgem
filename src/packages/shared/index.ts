export type UserRole = 'Admin' | 'SchoolManager' | 'Teacher' | 'Student' | 'Advisor' | 'Parent' | 'Viewer';

export const USER_ROLES: UserRole[] = [
  'Admin',
  'SchoolManager',
  'Teacher',
  'Student',
  'Advisor',
  'Parent',
  'Viewer',
];

/**
 * Validates role authorization for system actions.
 * Perfect for demonstrating basic RBAC (Role-Based Access Control) to junior engineers.
 */
export function canPerformAction(role: string, action: string): boolean {
  const currentRole = role as UserRole;
  if (!USER_ROLES.includes(currentRole)) return false;

  // Admin and SchoolManager bypass all restrictions
  if (currentRole === 'Admin') return true;

  switch (action) {
    // 1. Administrative operations (Courses, Sections, Teachers, Students)
    case 'course.create':
    case 'course.edit':
    case 'course.delete':
    case 'section.create':
    case 'section.edit':
    case 'section.delete':
    case 'teacher.create':
    case 'teacher.edit':
    case 'teacher.delete':
    case 'student.create':
    case 'student.edit':
    case 'student.delete':
    case 'enrollment.manage': // Enroll / Drop students
    case 'job.retry':         // Trigger background worker
    case 'logs.view':         // Log explorer access
      return currentRole === 'SchoolManager';

    // 2. Teacher specific operations
    case 'assignment.create':
    case 'assignment.edit':
    case 'assignment.publish':
    case 'submission.grade':  // Entering scores and feedback
    case 'attendance.record': // Section attendance sheets
    case 'teacher.workload.view':
      return currentRole === 'Teacher' || currentRole === 'SchoolManager';

    // 3. Advisor operations
    case 'intervention.create':
    case 'intervention.edit':
    case 'intervention.complete':
    case 'support.notes.read.private': // Read advisor notes
      return currentRole === 'Advisor' || currentRole === 'SchoolManager';

    // 4. Shared dashboards and profiles
    case 'dashboard.view':
    case 'student.profile.view':
      return true; // Everyone can see dashboards (subject to data masks)

    // 5. Run Mock Agents
    case 'agent.run.student':
    case 'agent.run.atrisk':
    case 'agent.run.attendance':
      return ['Teacher', 'Advisor', 'SchoolManager'].includes(currentRole);

    case 'agent.run.teacher':
      return ['SchoolManager'].includes(currentRole);

    default:
      return false;
  }
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
