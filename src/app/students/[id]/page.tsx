import React from 'react';
import { db } from '@/db';
import { getActiveUser } from '@/shared/auth';
import { formatDate, formatDateTime, getRiskBadgeStyle } from '@/shared';
import { calculateSectionGrade } from '@/domain/rules/grades';
import { calculateStudentRisk } from '@/domain/rules/risk';
import {
  enrollStudentAction,
  dropStudentAction,
  runAgentAction,
  createSupportNoteAction,
  createInterventionPlanAction,
} from '../../actions';
import { revalidatePath } from 'next/cache';
import Link from 'next/link';

export const revalidate = 0;

export default async function StudentDetailPage({ params }: { params: { id: string } }) {
  const studentId = params.id;
  const activeUser = await getActiveUser();

  // 1. Fetch Student facts
  const student = await db.student.findUniqueOrThrow({
    where: { id: studentId },
    include: {
      user: true,
      advisor: true,
      attendance: { include: { classSection: { include: { course: true } } } },
      enrollments: { include: { classSection: { include: { course: true, teacher: true } } } },
      submissions: { include: { assignment: true } },
      supportNotes: { include: { author: true } },
      interventionPlans: true,
    },
  });

  // Calculate overall average and risk
  const gradeCalc = calculateSectionGrade(
    student.submissions.map((s) => ({
      status: s.status,
      score: s.score,
      pointsPossible: s.assignment.pointsPossible,
    }))
  );
  const absences = student.attendance.filter((a) => a.status === 'Absent').length;
  const tardies = student.attendance.filter((a) => a.status === 'Tardy').length;

  const risk = calculateStudentRisk({
    gradeAverage: gradeCalc.percentage,
    missingAssignmentsCount: gradeCalc.missingCount,
    absencesCount: absences,
    tardiesCount: tardies,
  });

  // 2. Fetch other available class sections for enrolling dropdown
  const enrolledSectionIds = student.enrollments.map((e) => e.classSectionId);
  const availableSections = await db.classSection.findMany({
    where: {
      status: 'Active',
      id: { notIn: enrolledSectionIds },
    },
    include: { course: true, teacher: true },
  });

  // 3. Strict RBAC filter for Support Notes visibility!
  // Visibility levels: 'Shared', 'TeacherOnly', 'AdvisorOnly', 'AdminOnly'
  const visibleNotes = student.supportNotes.filter((note) => {
    if (note.visibility === 'Shared') return true;
    if (activeUser.role === 'Admin' || activeUser.role === 'SchoolManager') return true;
    if (note.visibility === 'TeacherOnly' && activeUser.role === 'Teacher') return true;
    if (note.visibility === 'AdvisorOnly' && activeUser.role === 'Advisor') return true;
    if (note.visibility === 'AdminOnly' && (activeUser.role as string) === 'Admin') return true;
    return false;
  });

  // 4. Fetch latest runs for this student
  const latestRuns = await db.agentRun.findMany({
    where: { targetType: 'Student', targetId: studentId },
    orderBy: { createdAt: 'desc' },
    take: 3,
  });

  // Inline Handlers for Server Action wrapping
  async function handleEnroll(formData: FormData) {
    'use server';
    const sectionId = formData.get('sectionId') as string;
    await enrollStudentAction({
      studentId,
      classSectionId: sectionId,
      actorId: activeUser.id,
    });
  }

  async function handleDrop(formData: FormData) {
    'use server';
    const enrollId = formData.get('enrollmentId') as string;
    await dropStudentAction(enrollId, activeUser.id);
  }

  async function handleRunSummaryAgent() {
    'use server';
    await runAgentAction({
      agentType: 'StudentProgressSummary',
      targetType: 'Student',
      targetId: studentId,
      createdById: activeUser.id,
    });
  }

  async function handleRunRiskAgent() {
    'use server';
    await runAgentAction({
      agentType: 'AtRiskStudentDetection',
      targetType: 'Student',
      targetId: studentId,
      createdById: activeUser.id,
    });
  }

  async function handleCreateNote(formData: FormData) {
    'use server';
    const content = formData.get('content') as string;
    const visibility = formData.get('visibility') as string;
    const noteType = formData.get('noteType') as string;

    await createSupportNoteAction({
      studentId,
      authorId: activeUser.id,
      visibility,
      noteType,
      content,
    });
  }

  async function handleCreateIntervention(formData: FormData) {
    'use server';
    const summary = formData.get('summary') as string;
    const riskArea = formData.get('riskArea') as string;
    const recommendedActions = formData.get('recommendedActions') as string;
    const followUpDate = formData.get('followUpDate') as string;

    await createInterventionPlanAction({
      studentId,
      createdById: activeUser.id,
      riskArea,
      summary,
      recommendedActions,
      followUpDate,
    });
  }

  const badgeStyle = getRiskBadgeStyle(risk.overallRiskLevel);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '32px' }}>
      
      {/* Student Profile Top Banner */}
      <div className="card" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', backgroundColor: '#ffffff' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '20px' }}>
          <span style={{ fontSize: '3rem' }}>👤</span>
          <div>
            <h2 style={{ margin: 0, fontFamily: "'Outfit', sans-serif" }}>{student.firstName} {student.lastName}</h2>
            <div style={{ display: 'flex', gap: '12px', fontSize: '0.85rem', color: 'var(--color-text-muted)', marginTop: '4px' }}>
              <span>ID: <code>{student.studentNumber}</code></span>
              <span>•</span>
              <span>{student.gradeLevel}</span>
              <span>•</span>
              <span>Status: <strong style={{ color: 'var(--color-success)' }}>{student.enrollmentStatus}</strong></span>
            </div>
            <div style={{ fontSize: '0.8rem', color: 'var(--color-text-light)', marginTop: '2px' }}>
              Guardian: {student.guardianName} ({student.guardianEmail}) | Advisor: {student.advisor?.name || 'None'}
            </div>
          </div>
        </div>

        {/* Dynamic Risk Score Render */}
        <div style={{ textAlign: 'right' }}>
          <span style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--color-text-muted)', textTransform: 'uppercase', display: 'block', marginBottom: '4px' }}>
            Risk Status
          </span>
          <span className="badge" style={{ backgroundColor: badgeStyle.bg, color: badgeStyle.text, fontSize: '0.9rem', padding: '6px 14px' }}>
            {risk.overallRiskLevel} Risk ({gradeCalc.percentage}%)
          </span>
        </div>
      </div>

      {/* CORE AGENT TRIGGER PANELS (Phase 4 & 5 showcase) */}
      <div className="card" style={{ border: '2px solid var(--color-primary-hover)', backgroundColor: 'var(--color-primary-light)' }}>
        <h3 style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '1.1rem', margin: 0, color: 'var(--color-primary-hover)' }}>
          <span>🤖 Heuristic Academic Insights Desk</span>
        </h3>
        <p style={{ fontSize: '0.85rem', color: 'var(--color-text-main)', marginTop: '6px', marginBottom: '16px' }}>
          Spawn local mock LLM agents to scan student grades, attendance runs, and support histories. Results persist with full trace step logs.
        </p>
        
        <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap', marginBottom: '20px' }}>
          {['Admin', 'SchoolManager', 'Teacher', 'Advisor'].includes(activeUser.role) ? (
            <>
              <form action={handleRunSummaryAgent}>
                <button type="submit" className="btn btn-primary btn-sm">
                  Run Student Progress Summary Agent 🚀
                </button>
              </form>

              <form action={handleRunRiskAgent}>
                <button type="submit" className="btn btn-danger btn-sm">
                  Run At-Risk Student Detection Agent 🔍
                </button>
              </form>
            </>
          ) : (
            <span style={{ fontSize: '0.8rem', color: 'var(--color-text-muted)' }}>
              🔒 Switching active role to Teacher, Advisor, or SchoolManager is required to execute academic agents.
            </span>
          )}
        </div>

        {/* LATEST RUNS GRID FOR THIS STUDENT */}
        {latestRuns.length > 0 && (
          <div>
            <h4 style={{ fontSize: '0.85rem', textTransform: 'uppercase', color: 'var(--color-text-muted)', letterSpacing: '0.05em', marginBottom: '8px' }}>
              Recent Run Outcomes
            </h4>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              {latestRuns.map((run) => {
                const out = run.outputJSON ? JSON.parse(run.outputJSON) : null;
                return (
                  <div key={run.id} style={{
                    backgroundColor: '#ffffff',
                    padding: '12px 16px',
                    borderRadius: 'var(--radius-sm)',
                    border: '1px solid var(--color-border)',
                    fontSize: '0.85rem'
                  }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px', fontSize: '0.75rem', fontWeight: 600 }}>
                      <span style={{ color: 'var(--color-primary)' }}>{run.agentType.replace(/([A-Z])/g, ' $1').trim()}</span>
                      <span style={{ color: 'var(--color-text-muted)' }}>{formatDateTime(run.createdAt)}</span>
                    </div>
                    <p style={{ margin: 0, fontWeight: 500, color: 'var(--color-text-main)' }}>{out?.summary}</p>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '8px', fontSize: '0.75rem' }}>
                      <span style={{ color: 'var(--color-text-light)' }}>Confidence Score: {run.confidenceScore ? Math.round(run.confidenceScore * 100) + '%' : 'N/A'}</span>
                      <Link href={`/agent-runs/${run.id}`} style={{ fontWeight: 600, textDecoration: 'underline' }}>
                        Open Step-by-Step Reasoning Trace →
                      </Link>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>

      {/* DUAL SECTION LAYOUT */}
      <div style={{ display: 'flex', gap: '32px' }}>
        
        {/* LEFT COLUMN: ENROLLMENTS & ATTENDANCE */}
        <div style={{ flex: 1.5, display: 'flex', flexDirection: 'column', gap: '32px' }}>
          
          {/* ENROLLMENTS CARD */}
          <div className="card">
            <h3 style={{ fontSize: '1.1rem', marginBottom: '16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span>📖 Class Section Enrollments</span>
              <span style={{ fontSize: '0.8rem', color: 'var(--color-text-muted)' }}>Total: {student.enrollments.length}</span>
            </h3>

            {student.enrollments.length === 0 ? (
              <p style={{ fontSize: '0.85rem', color: 'var(--color-text-muted)' }}>Student has no active enrollments.</p>
            ) : (
              <div className="table-wrapper" style={{ marginBottom: 0 }}>
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>Course</th>
                      <th>Teacher</th>
                      <th>Room</th>
                      <th>Status</th>
                      <th>Current Grade</th>
                      <th>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {student.enrollments.map((e) => {
                      const statusBadge = e.status === 'Waitlisted' ? 'badge-warning' : e.status === 'Dropped' ? 'badge-danger' : 'badge-success';
                      return (
                        <tr key={e.id}>
                          <td>
                            <Link href={`/sections/${e.classSectionId}`} style={{ fontWeight: 600 }}>
                              {e.classSection.course.title} ({e.classSection.course.code})
                            </Link>
                            <div style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)' }}>{e.classSection.term}</div>
                          </td>
                          <td>{e.classSection.teacher.firstName} {e.classSection.teacher.lastName}</td>
                          <td>{e.classSection.room}</td>
                          <td>
                            <span className={`badge ${statusBadge}`}>{e.status}</span>
                          </td>
                          <td><strong>{e.finalGrade !== null ? `${e.finalGrade}%` : 'Pending'}</strong></td>
                          <td>
                            {e.status === 'Enrolled' && ['Admin', 'SchoolManager'].includes(activeUser.role) ? (
                              <form action={handleDrop}>
                                <input type="hidden" name="enrollmentId" value={e.id} />
                                <button type="submit" className="btn btn-danger btn-sm">
                                  Drop
                                </button>
                              </form>
                            ) : (
                              <span style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)' }}>No Action</span>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}

            {/* ENROLL NEW STUDENT DROPDOWN PANEL (RBAC SchoolManager/Admin only) */}
            {['Admin', 'SchoolManager'].includes(activeUser.role) && availableSections.length > 0 && (
              <div style={{ marginTop: '24px', paddingTop: '20px', borderTop: '1px solid var(--color-border)' }}>
                <h4 style={{ fontSize: '0.85rem', marginBottom: '12px' }}>➕ Register Student into a Section</h4>
                <form action={handleEnroll} style={{ display: 'flex', gap: '12px', alignItems: 'flex-end' }}>
                  <div className="form-group" style={{ flex: 1, marginBottom: 0 }}>
                    <select name="sectionId" className="form-control" required>
                      {availableSections.map((s) => (
                        <option key={s.id} value={s.id}>
                          {s.course.title} ({s.course.code}) - {s.teacher.lastName} ({s.room})
                        </option>
                      ))}
                    </select>
                  </div>
                  <button type="submit" className="btn btn-primary btn-sm">
                    Complete Registration
                  </button>
                </form>
              </div>
            )}
          </div>

          {/* ATTENDANCE HISTORY */}
          <div className="card">
            <h3 style={{ fontSize: '1.1rem', marginBottom: '16px' }}>📅 Attendance Chronology ({student.attendance.length} sheets)</h3>
            {student.attendance.length === 0 ? (
              <p style={{ fontSize: '0.85rem', color: 'var(--color-text-muted)' }}>No attendance sheets recorded.</p>
            ) : (
              <div className="table-wrapper" style={{ maxHeight: '300px', overflowY: 'auto' }}>
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>Date</th>
                      <th>Course</th>
                      <th>Presence Status</th>
                      <th>Counselor Notes</th>
                    </tr>
                  </thead>
                  <tbody>
                    {[...student.attendance].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()).map((a) => {
                      const color = a.status === 'Absent' ? 'badge-danger' : a.status === 'Tardy' ? 'badge-warning' : 'badge-success';
                      return (
                        <tr key={a.id}>
                          <td>{formatDate(a.date)}</td>
                          <td>{a.classSection.course.code}</td>
                          <td>
                            <span className={`badge ${color}`}>{a.status}</span>
                          </td>
                          <td><span style={{ fontSize: '0.8rem', color: 'var(--color-text-muted)' }}>{a.notes || '—'}</span></td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>

        </div>

        {/* RIGHT COLUMN: SUPPORT NOTES (RBAC FILTERS) & INTERVENTION PLANS */}
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '32px' }}>
          
          {/* SUPPORT NOTES CARD (Strict RBAC Filtering) */}
          <div className="card">
            <h3 style={{ fontSize: '1.1rem', marginBottom: '12px' }}>📝 Student Support Notes</h3>
            <p style={{ fontSize: '0.8rem', color: 'var(--color-text-muted)', marginBottom: '16px' }}>
              Showing {visibleNotes.length} support logs authorized for role <strong>{activeUser.role}</strong>.
            </p>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', marginBottom: '20px' }}>
              {visibleNotes.map((note) => (
                <div key={note.id} style={{
                  padding: '12px',
                  backgroundColor: 'var(--color-bg)',
                  borderRadius: 'var(--radius-sm)',
                  border: '1px solid var(--color-border-light)'
                }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.75rem', fontWeight: 600, color: 'var(--color-text-muted)' }}>
                    <span>{note.author.name} ({note.noteType})</span>
                    <span className="badge badge-neutral" style={{ fontSize: '0.6rem' }}>{note.visibility}</span>
                  </div>
                  <p style={{ margin: '6px 0 0 0', fontSize: '0.85rem', color: 'var(--color-text-main)', lineHeight: 1.4 }}>
                    {note.content}
                  </p>
                </div>
              ))}
            </div>

            {/* ADD SUPPORT NOTE FORM (Restricted) */}
            {['Admin', 'SchoolManager', 'Teacher', 'Advisor'].includes(activeUser.role) ? (
              <form action={handleCreateNote} style={{ display: 'flex', flexDirection: 'column', gap: '10px', paddingTop: '16px', borderTop: '1px solid var(--color-border)' }}>
                <div className="form-group" style={{ marginBottom: 0 }}>
                  <textarea name="content" className="form-control" placeholder="Write student behavioral or academic observation..." rows={3} required style={{ resize: 'none' }} />
                </div>
                <div style={{ display: 'flex', gap: '8px' }}>
                  <div style={{ flex: 1 }}>
                    <select name="noteType" className="form-control" style={{ padding: '6px' }} required>
                      <option value="Academic">Academic</option>
                      <option value="Attendance">Attendance</option>
                      <option value="Behavior">Behavior</option>
                      <option value="FamilyCommunication">Family Comm</option>
                    </select>
                  </div>
                  <div style={{ flex: 1 }}>
                    <select name="visibility" className="form-control" style={{ padding: '6px' }} required>
                      <option value="Shared">Shared note</option>
                      <option value="TeacherOnly">Teacher Only</option>
                      <option value="AdvisorOnly">Advisor Only</option>
                      <option value="AdminOnly">Admin Only</option>
                    </select>
                  </div>
                </div>
                <button type="submit" className="btn btn-primary btn-sm" style={{ width: '100%' }}>
                  Submit Support Note
                </button>
              </form>
            ) : (
              <span style={{ fontSize: '0.75rem', color: 'var(--color-text-light)', display: 'block', textAlign: 'center' }}>
                🔒 Only teachers/advisors can add support notes.
              </span>
            )}
          </div>

          {/* ACTIVE INTERVENTION PLANS */}
          <div className="card">
            <h3 style={{ fontSize: '1.1rem', marginBottom: '16px' }}>🩹 Counseling Intervention Plans</h3>
            
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', marginBottom: '20px' }}>
              {student.interventionPlans.length === 0 ? (
                <p style={{ fontSize: '0.85rem', color: 'var(--color-text-muted)', margin: 0 }}>
                  No intervention plans recorded.
                </p>
              ) : (
                student.interventionPlans.map((plan) => {
                  const badge = plan.status === 'Active' ? 'badge-success' : 'badge-neutral';
                  return (
                    <div key={plan.id} style={{
                      padding: '12px',
                      border: '1px solid var(--color-border)',
                      borderRadius: 'var(--radius-sm)',
                      backgroundColor: '#ffffff'
                    }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                        <strong style={{ fontSize: '0.85rem' }}>{plan.summary}</strong>
                        <span className={`badge ${badge}`} style={{ fontSize: '0.6rem' }}>{plan.status}</span>
                      </div>
                      <div style={{ fontSize: '0.8rem', color: 'var(--color-text-muted)', marginBottom: '8px' }}>
                        Area: {plan.riskArea} | Follow Up: {formatDate(plan.followUpDate)}
                      </div>
                      <p style={{ margin: 0, fontSize: '0.8rem', color: 'var(--color-text-main)', lineHeight: 1.4, whiteSpace: 'pre-wrap' }}>
                        <strong>Actions:</strong><br />{plan.recommendedActions}
                      </p>
                    </div>
                  );
                })
              )}
            </div>

            {/* CREATE PLAN (Only Advisors / Managers) */}
            {['Admin', 'SchoolManager', 'Advisor'].includes(activeUser.role) ? (
              <form action={handleCreateIntervention} style={{ display: 'flex', flexDirection: 'column', gap: '10px', paddingTop: '16px', borderTop: '1px solid var(--color-border)' }}>
                <h4 style={{ fontSize: '0.85rem', margin: 0 }}>➕ Spawn New Intervention Plan</h4>
                
                <div className="form-group" style={{ marginBottom: 0 }}>
                  <input name="summary" className="form-control" placeholder="Plan Summary e.g., Algebra Math Support" required />
                </div>

                <div style={{ display: 'flex', gap: '8px' }}>
                  <div style={{ flex: 1 }}>
                    <select name="riskArea" className="form-control" required style={{ padding: '6px' }}>
                      <option value="Grades">Grades Risk</option>
                      <option value="Attendance">Attendance Risk</option>
                      <option value="Engagement">Engagement Risk</option>
                      <option value="Behavior">Behavioral Risk</option>
                    </select>
                  </div>
                  <div style={{ flex: 1 }}>
                    <input name="followUpDate" type="date" className="form-control" required style={{ padding: '4px 6px' }} />
                  </div>
                </div>

                <div className="form-group" style={{ marginBottom: 0 }}>
                  <textarea name="recommendedActions" className="form-control" placeholder="Action Items (1 per line)..." rows={3} required style={{ resize: 'none' }} />
                </div>

                <button type="submit" className="btn btn-danger btn-sm" style={{ width: '100%' }}>
                  Activate Intervention Plan
                </button>
              </form>
            ) : (
              <span style={{ fontSize: '0.75rem', color: 'var(--color-text-light)', display: 'block', textAlign: 'center' }}>
                🔒 Intervention Plan activation is restricted to Advisors/SchoolManagers.
              </span>
            )}
          </div>

        </div>

      </div>

    </div>
  );
}
