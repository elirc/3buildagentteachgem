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
