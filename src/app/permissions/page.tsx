import React from 'react';
import { getActiveUser } from '@/shared/auth';
import {
  USER_ROLES,
  PERMISSION_ACTIONS,
  canPerformAction,
  describeAllowedRoles,
  type PermissionAction,
} from '@/shared';
import Link from 'next/link';

export const revalidate = 0;

/**
 * The permission matrix, generated from the table rather than written down.
 *
 * A hand-maintained document of "who can do what" is wrong the moment someone
 * edits the code and forgets the doc. This page cannot drift, because it calls
 * the same canPerformAction the buttons call — if the grid says a Teacher may
 * grade, a Teacher may grade.
 */
export default async function PermissionsPage() {
  const activeUser = await getActiveUser();

  const groups: Array<{ title: string; prefixes: string[] }> = [
    { title: 'Academic administration', prefixes: ['course.', 'section.', 'student.create', 'teacher.'] },
    { title: 'Enrolment', prefixes: ['enrollment.'] },
    { title: 'Coursework & grading', prefixes: ['assignment.', 'submission.', 'attendance.'] },
    { title: 'Pastoral care', prefixes: ['supportNote.', 'intervention.'] },
    { title: 'Operations', prefixes: ['job.', 'logs.', 'permissions.'] },
    { title: 'Agents', prefixes: ['agent.'] },
    { title: 'Shared reads', prefixes: ['dashboard.', 'student.profile'] },
  ];

  const grouped = groups.map((g) => ({
    ...g,
    actions: PERMISSION_ACTIONS.filter((a) => g.prefixes.some((p) => a.startsWith(p))),
  }));

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
      <div>
        <h2 style={{ fontFamily: "'Outfit', sans-serif", fontSize: '1.8rem', fontWeight: 700, margin: 0 }}>
          Permission Matrix
        </h2>
        <p style={{ margin: 0, color: 'var(--color-text-muted)', fontSize: '0.9rem' }}>
          Every action in the app and the roles that may perform it. Generated from
          <code> PERMISSION_MATRIX</code> — this page cannot disagree with the buttons,
          because it calls the same function they do.
        </p>
      </div>

      <div className="card" style={{ fontSize: '0.85rem', lineHeight: 1.6 }}>
        <strong>Reading this table.</strong> A ✅ means the role may perform the action.
        Admin is ✅ everywhere by a short-circuit in <code>canPerformAction</code> rather than
        by being listed in the matrix — which is exactly the kind of nuance a hand-written
        document gets wrong.
        <br />
        <br />
        Gating an action is <em>not</em> the same as scoping data. A Teacher may open a student
        profile; which students they can open is decided separately by
        <code> buildStudentScope</code>. Hiding a button hides it from the UI, not from anyone
        who can POST to the Server Action behind it.
        <br />
        <br />
        Your active role is <strong>{activeUser.role}</strong>. Switch roles in the header to
        watch this grid change.
      </div>

      <div className="table-wrapper" style={{ overflowX: 'auto' }}>
        <table className="data-table">
          <thead>
            <tr>
              <th style={{ position: 'sticky', left: 0, backgroundColor: '#ffffff', zIndex: 2, minWidth: '220px' }}>
                Action
              </th>
              {USER_ROLES.map((role) => (
                <th key={role} style={{ textAlign: 'center', minWidth: '90px' }}>
                  {role === activeUser.role ? <u>{role}</u> : role}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {grouped.map((group) => (
              <React.Fragment key={group.title}>
                <tr>
                  <td
                    colSpan={USER_ROLES.length + 1}
                    style={{
                      backgroundColor: 'var(--color-bg)',
                      fontWeight: 700,
                      fontSize: '0.75rem',
                      textTransform: 'uppercase',
                      letterSpacing: '0.05em',
                      color: 'var(--color-text-muted)',
                    }}
                  >
                    {group.title}
                  </td>
                </tr>

                {group.actions.map((action: PermissionAction) => {
                  const allowed = describeAllowedRoles(action);
                  return (
                    <tr key={action}>
                      <td style={{ position: 'sticky', left: 0, backgroundColor: '#ffffff', zIndex: 1 }}>
                        <code style={{ fontSize: '0.75rem' }}>{action}</code>
                        {allowed.length === 0 && (
                          <div style={{ fontSize: '0.65rem', color: 'var(--color-danger-text)' }}>
                            Admin only
                          </div>
                        )}
                      </td>
                      {USER_ROLES.map((role) => (
                        <td
                          key={role}
                          style={{
                            textAlign: 'center',
                            backgroundColor: role === activeUser.role ? 'var(--color-primary-light)' : undefined,
                          }}
                        >
                          {canPerformAction(role, action) ? '✅' : <span style={{ color: 'var(--color-text-light)' }}>—</span>}
                        </td>
                      ))}
                    </tr>
                  );
                })}
              </React.Fragment>
            ))}
          </tbody>
        </table>
      </div>

      <div style={{ fontSize: '0.8rem', color: 'var(--color-text-muted)' }}>
        Defined in <code>src/packages/shared/index.ts</code>. See also{' '}
        <Link href="/audits">the audit trail</Link> for what was actually done, by whom.
      </div>
    </div>
  );
}
