import React from 'react';
import { db } from '@/db';
import { getActiveUser } from '@/shared/auth';
import { formatDate } from '@/shared';
import { calculateTeacherWorkload } from '@/domain/rules/workload';
import { calculateSectionGrade } from '@/domain/rules/grades';
import { recordAuditEvent } from '@/observability/audit';
import { runAgentAction } from '../actions';
import { revalidatePath } from 'next/cache';
import Link from 'next/link';

export const revalidate = 0;

export default async function TeachersListPage() {
  const activeUser = await getActiveUser();

  // Handle new teacher profile registration
  async function createTeacherAction(formData: FormData) {
    'use server';
    const activeSession = await getActiveUser();
    const firstName = formData.get('firstName') as string;
    const lastName = formData.get('lastName') as string;
    const email = formData.get('email') as string;
    const department = formData.get('department') as string;
    const officeLocation = formData.get('officeLocation') as string;

    const teacher = await db.teacher.create({
      data: {
        firstName,
        lastName,
        email,
        department,
        employmentStatus: 'Active',
        subjectsJSON: JSON.stringify([]),
        officeLocation,
      },
    });

    await recordAuditEvent({
      actorId: activeSession.id,
      action: 'teacher.create',
      entityType: 'Teacher',
      entityId: teacher.id,
      after: teacher,
    });

    revalidatePath('/teachers');
  }

  // Fetch all teachers in the ecosystem
  const teachers = await db.teacher.findMany({
    include: {
      classSections: {
        where: { status: 'Active' },
        include: { enrollments: { where: { status: 'Enrolled' } } },
      },
    },
    orderBy: { lastName: 'asc' },
  });

  const teachersWithMetrics = [];

  for (const t of teachers) {
    const sectionIds = t.classSections.map((s) => s.id);
    const capacitySum = t.classSections.reduce((sum, s) => sum + s.capacity, 0);

    // Ungraded homework count
    const ungradedCount = await db.submission.count({
      where: {
        status: 'Submitted',
        assignment: { classSectionId: { in: sectionIds } },
      },
    });

    // Enrolled at-risk students count
    const enrollments = await db.enrollment.findMany({
      where: { classSectionId: { in: sectionIds }, status: 'Enrolled' },
    });
    const studentIds = [...new Set(enrollments.map((e) => e.studentId))];
    
    let atRiskCount = 0;
    for (const stuId of studentIds) {
      const submissions = await db.submission.findMany({
        where: { studentId: stuId },
        include: { assignment: true },
      });
      const grade = calculateSectionGrade(
        submissions.map((s) => ({
          status: s.status,
          score: s.score,
          pointsPossible: s.assignment.pointsPossible,
        }))
      );
      if (grade.percentage < 70) {
        atRiskCount++;
      }
    }

    const wl = calculateTeacherWorkload({
      activeSectionsCount: t.classSections.length,
      totalStudentsCapacity: capacitySum,
      ungradedSubmissionsCount: ungradedCount,
      atRiskStudentsCount: atRiskCount,
      teacherStatus: t.employmentStatus,
    });

    teachersWithMetrics.push({
      ...t,
      sectionsCount: t.classSections.length,
      capacitySum,
      ungradedCount,
      atRiskCount,
      workload: wl,
    });
  }

  // Handle direct insight agent run
  async function triggerTeacherAgent(formData: FormData) {
    'use server';
    const teacherId = formData.get('teacherId') as string;
    await runAgentAction({
      agentType: 'TeacherWorkloadInsight',
      targetType: 'Teacher',
      targetId: teacherId,
      createdById: activeUser.id,
    });
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '32px' }}>
      
      <div>
        <h2 style={{ fontFamily: "'Outfit', sans-serif", fontSize: '1.8rem', fontWeight: 700, margin: 0 }}>
          Teacher & Staffing Workloads
        </h2>
        <p style={{ margin: 0, color: 'var(--color-text-muted)', fontSize: '0.9rem' }}>
          Evaluate educator capacity scores, check unsubmitted homework backlogs, and run workload insight agents to optimize staffing distributions.
        </p>
      </div>

      <div style={{ display: 'flex', gap: '32px' }}>
        
        {/* TEACHERS LIST GRID */}
        <div style={{ flex: 2, display: 'flex', flexDirection: 'column', gap: '24px' }}>
          
          <div className="grid-2">
            {teachersWithMetrics.map((t) => {
              const wl = t.workload;
              let wlBg = 'var(--color-success)';
              if (wl.status === 'Critically Overloaded') wlBg = 'var(--color-danger)';
              else if (wl.status === 'Overloaded') wlBg = 'var(--color-warning)';

              return (
                <div key={t.id} className="card" style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                    <div>
                      <h3 style={{ fontSize: '1.1rem', margin: 0 }}>{t.firstName} {t.lastName}</h3>
                      <span style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)' }}>
                        Department: {t.department} | Room: {t.officeLocation}
                      </span>
                    </div>
                    <span className="badge badge-neutral" style={{ fontSize: '0.65rem' }}>
                      {t.employmentStatus}
                    </span>
                  </div>

                  {/* Workload Progress Bar */}
                  <div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.75rem', fontWeight: 600, marginBottom: '4px' }}>
                      <span>Workload Standard: {wl.status}</span>
                      <span>{wl.workloadScore}/100</span>
                    </div>
                    <div style={{ height: '8px', backgroundColor: '#e2e8f0', borderRadius: '4px', overflow: 'hidden' }}>
                      <div style={{ width: `${wl.workloadScore}%`, height: '100%', backgroundColor: wlBg }} />
                    </div>
                  </div>

                  {/* Workload breakdown metrics */}
                  <div style={{ display: 'flex', gap: '12px', fontSize: '0.8rem', backgroundColor: 'var(--color-bg)', padding: '10px', borderRadius: 'var(--radius-sm)' }}>
                    <div style={{ flex: 1, textAlign: 'center' }}>
                      <strong style={{ display: 'block', fontSize: '1rem' }}>{t.sectionsCount}</strong>
                      <span style={{ fontSize: '0.65rem', color: 'var(--color-text-muted)', textTransform: 'uppercase' }}>Sections</span>
                    </div>
                    <div style={{ flex: 1, textAlign: 'center' }}>
                      <strong style={{ display: 'block', fontSize: '1rem' }}>{t.capacitySum}</strong>
                      <span style={{ fontSize: '0.65rem', color: 'var(--color-text-muted)', textTransform: 'uppercase' }}>Students</span>
                    </div>
                    <div style={{ flex: 1, textAlign: 'center', color: t.ungradedCount > 3 ? 'var(--color-danger)' : 'inherit' }}>
                      <strong style={{ display: 'block', fontSize: '1rem' }}>{t.ungradedCount}</strong>
                      <span style={{ fontSize: '0.65rem', color: 'var(--color-text-muted)', textTransform: 'uppercase' }}>Backlog</span>
                    </div>
                    <div style={{ flex: 1, textAlign: 'center', color: t.atRiskCount > 0 ? 'var(--color-warning-text)' : 'inherit' }}>
                      <strong style={{ display: 'block', fontSize: '1rem' }}>{t.atRiskCount}</strong>
                      <span style={{ fontSize: '0.65rem', color: 'var(--color-text-muted)', textTransform: 'uppercase' }}>At Risk</span>
                    </div>
                  </div>

                  {/* Warning lists if overloaded */}
                  {wl.warnings.length > 0 && (
                    <div style={{ fontSize: '0.75rem', color: 'var(--color-danger-text)', backgroundColor: 'var(--color-danger-bg)', padding: '6px 10px', borderRadius: 'var(--radius-sm)' }}>
                      ⚠️ {wl.warnings[0]}
                    </div>
                  )}

                  {/* Run insight agent (restricted) */}
                  {['Admin', 'SchoolManager'].includes(activeUser.role) ? (
                    <form action={triggerTeacherAgent} style={{ marginTop: 'auto' }}>
                      <input type="hidden" name="teacherId" value={t.id} />
                      <button type="submit" className="btn btn-secondary btn-sm" style={{ width: '100%' }}>
                        Run Teacher Workload Insight Agent 🤖
                      </button>
                    </form>
                  ) : (
                    <span style={{ fontSize: '0.7rem', color: 'var(--color-text-light)', textAlign: 'center' }}>
                      🔒 Switch to SchoolManager to execute workload diagnostics.
                    </span>
                  )}
                </div>
              );
            })}
          </div>

        </div>

        {/* REGISTRATION FORM PANEL (RBAC Admin/SchoolManager) */}
        {['Admin', 'SchoolManager'].includes(activeUser.role) ? (
          <div style={{ flex: 1 }}>
            <div className="card">
              <h3 style={{ fontSize: '1.1rem', marginBottom: '16px' }}>➕ Register Teacher Profile</h3>
              <form action={createTeacherAction} style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                
                <div className="form-group">
                  <label className="form-label">First Name</label>
                  <input name="firstName" className="form-control" placeholder="Marcus" required />
                </div>

                <div className="form-group">
                  <label className="form-label">Last Name</label>
                  <input name="lastName" className="form-control" placeholder="Aurelius" required />
                </div>

                <div className="form-group">
                  <label className="form-label">School Email</label>
                  <input name="email" type="email" className="form-control" placeholder="marcus.aurelius@example.com" required />
                </div>

                <div className="form-group">
                  <label className="form-label">Department / Faculty</label>
                  <select name="department" className="form-control" required>
                    <option value="Mathematics">Mathematics</option>
                    <option value="Science">Science</option>
                    <option value="English Literature">English Literature</option>
                    <option value="History">History</option>
                    <option value="Computer Science">Computer Science</option>
                  </select>
                </div>

                <div className="form-group">
                  <label className="form-label">Office / Classroom Room</label>
                  <input name="officeLocation" className="form-control" placeholder="Room 402, Building B" required />
                </div>

                <button type="submit" className="btn btn-primary" style={{ marginTop: '8px' }}>
                  Register Educator
                </button>
              </form>
            </div>
          </div>
        ) : (
          <div style={{ flex: 1 }}>
            <div className="card" style={{ backgroundColor: 'var(--color-bg)', borderStyle: 'dashed' }}>
              <span style={{ fontSize: '1.2rem', display: 'block', marginBottom: '8px' }}>🔐 Admin Panel</span>
              <p style={{ fontSize: '0.8rem', color: 'var(--color-text-muted)', margin: 0, lineHeight: 1.4 }}>
                Registering new educator profiles is constrained to administrative accounts. Switch your active role in the header to <strong>SchoolManager</strong> or <strong>Admin</strong>.
              </p>
            </div>
          </div>
        )}

      </div>

    </div>
  );
}
