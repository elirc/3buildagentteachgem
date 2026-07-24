import React from 'react';
import { db } from '@/db';
import { getActiveUser } from '@/shared/auth';
import { formatDate, formatDateTime } from '@/shared';
import {
  saveGradeAction,
  recordAttendanceAction,
  runAgentAction,
} from '../../actions';
import { revalidatePath } from 'next/cache';
import Link from 'next/link';

export const revalidate = 0;

export default async function SectionDetailPage({ params }: { params: { id: string } }) {
  const sectionId = params.id;
  const activeUser = await getActiveUser();

  // 1. Fetch Class Section details with enrollments
  const section = await db.classSection.findUniqueOrThrow({
    where: { id: sectionId },
    include: {
      course: true,
      teacher: true,
      enrollments: {
        include: { student: { include: { submissions: { include: { assignment: true } } } } },
      },
      assignments: { orderBy: { dueDate: 'asc' } },
    },
  });

  // Calculate enrolled vs waitlisted
  const enrolled = section.enrollments.filter((e) => e.status === 'Enrolled');
  const waitlisted = section.enrollments.filter((e) => e.status === 'Waitlisted');

  // Load all submissions for this section to display grading backlog
  const submissions = await db.submission.findMany({
    where: { assignment: { classSectionId: sectionId } },
    include: { student: true, assignment: true },
    orderBy: { submittedAt: 'desc' },
  });

  const ungradedSubmissions = submissions.filter((s) => s.status === 'Submitted');

  // Load latest anomaly agent runs on this section
  const latestRuns = await db.agentRun.findMany({
    where: { targetType: 'ClassSection', targetId: sectionId, agentType: 'AttendanceAnomaly' },
    orderBy: { createdAt: 'desc' },
    take: 2,
  });

  // Server actions wrapper handlers
  async function handleGrade(formData: FormData) {
    'use server';
    const submissionId = formData.get('submissionId') as string;
    const score = Number(formData.get('score'));
    const feedback = formData.get('feedback') as string;

    await saveGradeAction({
      submissionId,
      score,
      feedback,
      actorId: activeUser.id,
    });
  }

  async function handleAttendanceSubmit(formData: FormData) {
    'use server';
    const dateStr = formData.get('date') as string;
    const records = enrolled.map((e) => {
      const status = formData.get(`status-${e.studentId}`) as string;
      const notes = formData.get(`notes-${e.studentId}`) as string;
      return {
        studentId: e.studentId,
        status,
        notes,
      };
    });

    await recordAttendanceAction({
      classSectionId: sectionId,
      date: dateStr,
      records,
      actorId: activeUser.id,
    });
  }

  async function handleRunAnomalyAgent() {
    'use server';
    await runAgentAction({
      agentType: 'AttendanceAnomaly',
      targetType: 'ClassSection',
      targetId: sectionId,
      createdById: activeUser.id,
    });
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '32px' }}>
      
      {/* Section Header Banner */}
      <div className="card" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <span style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--color-primary)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
            Classroom Registry Section
          </span>
          <h2 style={{ margin: '4px 0 0 0', fontFamily: "'Outfit', sans-serif" }}>
            {section.course.title} ({section.course.code})
          </h2>
          <div style={{ fontSize: '0.85rem', color: 'var(--color-text-muted)', marginTop: '6px' }}>
            Instructor: <strong>{section.teacher.firstName} {section.teacher.lastName}</strong> | Term: {section.term} | Location: <code>{section.room}</code>
          </div>
        </div>

        <div style={{ display: 'flex', gap: '16px', fontSize: '0.85rem', textAlign: 'right' }}>
          <div>
            <span style={{ display: 'block', color: 'var(--color-text-muted)', fontSize: '0.7rem', textTransform: 'uppercase' }}>Enrolled</span>
            <strong style={{ fontSize: '1.2rem' }}>{enrolled.length} / {section.capacity}</strong>
          </div>
          <div>
            <span style={{ display: 'block', color: 'var(--color-text-muted)', fontSize: '0.7rem', textTransform: 'uppercase' }}>Waitlisted</span>
            <strong style={{ fontSize: '1.2rem', color: waitlisted.length > 0 ? 'var(--color-warning)' : 'inherit' }}>{waitlisted.length}</strong>
          </div>
          <div>
            <span style={{ display: 'block', color: 'var(--color-text-muted)', fontSize: '0.7rem', textTransform: 'uppercase' }}>Grading Backlog</span>
            <strong style={{ fontSize: '1.2rem', color: ungradedSubmissions.length > 0 ? 'var(--color-danger)' : 'inherit' }}>{ungradedSubmissions.length}</strong>
          </div>
        </div>
      </div>

      {/* DUAL WORKSPACE SHEETS: ROSTER & ATTENDANCE AGENT */}
      <div style={{ display: 'flex', gap: '32px' }}>
        
        {/* LEFT SHEET: ROSTER & BACKLOG GRADING */}
        <div style={{ flex: 1.6, display: 'flex', flexDirection: 'column', gap: '32px' }}>
          
          {/* STUDENT ROSTER LIST */}
          <div className="card">
            <h3 style={{ fontSize: '1.1rem', marginBottom: '16px' }}>👨‍🎓 Enrolled Student Roster</h3>
            {enrolled.length === 0 ? (
              <p style={{ fontSize: '0.85rem', color: 'var(--color-text-muted)', margin: 0 }}>
                Roster is empty. Enroll students from student profile dashboards.
              </p>
            ) : (
              <div className="table-wrapper" style={{ marginBottom: 0 }}>
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>Student Name</th>
                      <th>Student Number</th>
                      <th>Enrollment Date</th>
                      <th>Cumulative Class Mark</th>
                      <th>Detail View</th>
                    </tr>
                  </thead>
                  <tbody>
                    {enrolled.map((e) => (
                      <tr key={e.id}>
                        <td>
                          <Link href={`/students/${e.studentId}`} style={{ fontWeight: 600 }}>
                            {e.student.firstName} {e.student.lastName}
                          </Link>
                        </td>
                        <td><code>{e.student.studentNumber}</code></td>
                        <td>{formatDate(e.createdAt)}</td>
                        <td><strong>{e.finalGrade !== null ? `${e.finalGrade}%` : 'Pending'}</strong></td>
                        <td>
                          <Link href={`/students/${e.studentId}`} className="btn btn-secondary btn-sm">
                            View File
                          </Link>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {/* WAITLIST ROSTER */}
            {waitlisted.length > 0 && (
              <div style={{ marginTop: '24px', paddingTop: '20px', borderTop: '1px dashed var(--color-border)' }}>
                <h4 style={{ fontSize: '0.85rem', color: 'var(--color-warning-text)', marginBottom: '12px' }}>
                  ⏳ Waitlisted Students ({waitlisted.length})
                </h4>
                <div className="table-wrapper" style={{ marginBottom: 0 }}>
                  <table className="data-table">
                    <thead>
                      <tr>
                        <th>Student Name</th>
                        <th>Student Number</th>
                        <th>Queue Date</th>
                        <th>Roster Action</th>
                      </tr>
                    </thead>
                    <tbody>
                      {waitlisted.map((w) => (
                        <tr key={w.id}>
                          <td>{w.student.firstName} {w.student.lastName}</td>
                          <td><code>{w.student.studentNumber}</code></td>
                          <td>{formatDate(w.createdAt)}</td>
                          <td>
                            <span className="badge badge-warning">Waitlisted</span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>

          {/* ACTIVE GRADING COCKPIT (INTERACTIVE EVALUATION ASSISTANT) */}
          <div className="card">
            <h3 style={{ fontSize: '1.1rem', marginBottom: '8px' }}>✍️ Grading evaluation cockpit</h3>
            <p style={{ fontSize: '0.85rem', color: 'var(--color-text-muted)', marginBottom: '20px' }}>
              Evaluate unsubmitted homework backlogs. Entering a score schedules a background <code>GradeRecalculation</code> job to automatically refresh class section grade averages.
            </p>

            {ungradedSubmissions.length === 0 ? (
              <div style={{
                padding: '24px',
                textAlign: 'center',
                backgroundColor: 'var(--color-bg)',
                borderRadius: 'var(--radius-sm)',
                border: '1px dashed var(--color-border)',
                color: 'var(--color-text-muted)',
                fontSize: '0.85rem'
              }}>
                🎉 Excellent work! Roster grading backlog is completely cleared.
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
                {ungradedSubmissions.map((sub) => (
                  <div key={sub.id} style={{
                    padding: '20px',
                    border: '1px solid var(--color-border)',
                    borderRadius: 'var(--radius-md)',
                    backgroundColor: '#ffffff'
                  }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '12px' }}>
                      <div>
                        <strong style={{ fontSize: '0.9rem' }}>{sub.student.firstName} {sub.student.lastName}</strong>
                        <span style={{ fontSize: '0.8rem', color: 'var(--color-text-muted)', display: 'block' }}>
                          Assignment: "{sub.assignment.title}" (Max points: {sub.assignment.pointsPossible})
                        </span>
                      </div>
                      <span className="badge badge-warning" style={{ fontSize: '0.65rem' }}>
                        Submitted {sub.submittedAt ? formatDate(sub.submittedAt) : 'N/A'}
                      </span>
                    </div>

                    {/* Renders content student submitted */}
                    <div style={{
                      padding: '12px',
                      backgroundColor: 'var(--color-bg)',
                      borderRadius: 'var(--radius-sm)',
                      fontSize: '0.8rem',
                      fontFamily: 'monospace',
                      marginBottom: '16px',
                      maxHeight: '100px',
                      overflowY: 'auto',
                      border: '1px solid var(--color-border-light)'
                    }}>
                      {sub.contentText || 'No paper attachment text.'}
                    </div>

                    {/* Form to submit grade */}
                    {['Admin', 'SchoolManager', 'Teacher'].includes(activeUser.role) ? (
                      <form action={handleGrade} style={{ display: 'flex', gap: '12px', alignItems: 'flex-end' }}>
                        <input type="hidden" name="submissionId" value={sub.id} />
                        
                        <div className="form-group" style={{ flex: 0.5, marginBottom: 0 }}>
                          <label className="form-label">Earned Score</label>
                          <input name="score" type="number" className="form-control" required min={0} max={sub.assignment.pointsPossible} placeholder={`0-${sub.assignment.pointsPossible}`} />
                        </div>

                        <div className="form-group" style={{ flex: 1.5, marginBottom: 0 }}>
                          <label className="form-label">Narrative Feedback Comments</label>
                          <input name="feedback" className="form-control" required placeholder="Praise strengths or suggest topic remediation..." />
                        </div>

                        <button type="submit" className="btn btn-success btn-sm">
                          Submit Grade & Recalculate
                        </button>
                      </form>
                    ) : (
                      <span style={{ fontSize: '0.75rem', color: 'var(--color-text-light)' }}>
                        🔒 Grade submission is restricted to Section Teachers and SchoolManagers.
                      </span>
                    )}

                  </div>
                ))}
              </div>
            )}
          </div>

        </div>

        {/* RIGHT SHEET: ATTENDANCE SHEETS & ANOMALY AGENTS */}
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '32px' }}>
          
          {/* RECORD ATTENDANCE REGISTER */}
          <div className="card">
            <h3 style={{ fontSize: '1.1rem', marginBottom: '8px' }}>📝 Record Daily Attendance</h3>
            <p style={{ fontSize: '0.8rem', color: 'var(--color-text-muted)', marginBottom: '16px' }}>
              Select a calendar date to log class presence status. Submitting schedules an <code>AttendanceSummary</code> data consolidation report.
            </p>

            {['Admin', 'SchoolManager', 'Teacher'].includes(activeUser.role) ? (
              <form action={handleAttendanceSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                
                <div className="form-group">
                  <label className="form-label">Attendance Date</label>
                  <input name="date" type="date" className="form-control" defaultValue={new Date().toISOString().split('T')[0]} required style={{ padding: '6px' }} />
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                  {enrolled.map((e) => (
                    <div key={e.studentId} style={{
                      display: 'flex',
                      flexDirection: 'column',
                      gap: '4px',
                      padding: '10px',
                      backgroundColor: 'var(--color-bg)',
                      borderRadius: 'var(--radius-sm)'
                    }}>
                      <span style={{ fontSize: '0.8rem', fontWeight: 600 }}>
                        {e.student.firstName} {e.student.lastName}
                      </span>
                      
                      <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
                        
                        <label style={{ fontSize: '0.75rem', display: 'flex', alignItems: 'center', gap: '4px', cursor: 'pointer' }}>
                          <input type="radio" name={`status-${e.studentId}`} value="Present" defaultChecked required />
                          Present
                        </label>

                        <label style={{ fontSize: '0.75rem', display: 'flex', alignItems: 'center', gap: '4px', cursor: 'pointer', color: 'var(--color-danger-text)' }}>
                          <input type="radio" name={`status-${e.studentId}`} value="Absent" required />
                          Absent
                        </label>

                        <label style={{ fontSize: '0.75rem', display: 'flex', alignItems: 'center', gap: '4px', cursor: 'pointer', color: 'var(--color-warning-text)' }}>
                          <input type="radio" name={`status-${e.studentId}`} value="Tardy" required />
                          Tardy
                        </label>

                        <label style={{ fontSize: '0.75rem', display: 'flex', alignItems: 'center', gap: '4px', cursor: 'pointer', color: 'var(--color-info-text)' }}>
                          <input type="radio" name={`status-${e.studentId}`} value="Excused" required />
                          Excused
                        </label>

                      </div>

                      <input name={`notes-${e.studentId}`} className="form-control" placeholder="Tardy reason, behavior, etc. (optional)" style={{ padding: '4px 8px', fontSize: '0.75rem', marginTop: '6px' }} />

                    </div>
                  ))}
                </div>

                <button type="submit" className="btn btn-primary btn-sm" style={{ width: '100%', marginTop: '8px' }}>
                  Register Daily Attendance Sheet
                </button>
              </form>
            ) : (
              <span style={{ fontSize: '0.75rem', color: 'var(--color-text-light)', display: 'block', textAlign: 'center' }}>
                🔒 Recording daily attendance sheets is restricted to Section Teachers and SchoolManagers.
              </span>
            )}
          </div>

          {/* ATTENDANCE ANOMALY AGENT triggered directly here! */}
          <div className="card" style={{ border: '2px solid var(--color-info)', backgroundColor: 'var(--color-info-bg)' }}>
            <h3 style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '1.1rem', margin: 0, color: 'var(--color-info-text)' }}>
              <span>🤖 Roster Attendance Anomaly Agent</span>
            </h3>
            <p style={{ fontSize: '0.85rem', color: 'var(--color-text-main)', marginTop: '6px', marginBottom: '16px' }}>
              Triggers the diagnostic agent to audit historical attendance sheets for consecutive absence streaks or date wide field-trip sync drop-offs.
            </p>

            {['Admin', 'SchoolManager', 'Teacher'].includes(activeUser.role) ? (
              <form action={handleRunAnomalyAgent} style={{ marginBottom: '16px' }}>
                <button type="submit" className="btn btn-primary btn-sm" style={{ backgroundColor: 'var(--color-info)', borderColor: 'var(--color-info)' }}>
                  Audit Section Attendance 🔍
                </button>
              </form>
            ) : (
              <span style={{ fontSize: '0.75rem', color: 'var(--color-text-light)', display: 'block', marginBottom: '12px' }}>
                🔒 Switch to Teacher or Manager to launch attendance anomalies audits.
              </span>
            )}

            {/* Run outcomes display */}
            {latestRuns.length > 0 && (
              <div>
                <h4 style={{ fontSize: '0.8rem', textTransform: 'uppercase', color: 'var(--color-text-muted)', marginBottom: '8px' }}>
                  Last Audit Run Outcome
                </h4>
                {latestRuns.map((run) => {
                  const out = run.outputJSON ? JSON.parse(run.outputJSON) : null;
                  return (
                    <div key={run.id} style={{
                      backgroundColor: '#ffffff',
                      padding: '12px',
                      borderRadius: 'var(--radius-sm)',
                      border: '1px solid var(--color-border)',
                      fontSize: '0.8rem'
                    }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px', fontWeight: 600 }}>
                        <span style={{ color: 'var(--color-info-text)' }}>Anomaly Score: {out?.metadata?.anomalyScore || 0}/100</span>
                        <span style={{ color: 'var(--color-text-muted)' }}>{formatDateTime(run.createdAt)}</span>
                      </div>
                      <p style={{ margin: 0, color: 'var(--color-text-main)', lineHeight: 1.4 }}>{out?.summary}</p>
                      <div style={{ marginTop: '8px', textAlign: 'right' }}>
                        <Link href={`/agent-runs/${run.id}`} style={{ fontWeight: 600, textDecoration: 'underline', fontSize: '0.75rem' }}>
                          Open reasoning trace steps →
                        </Link>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

        </div>

      </div>

    </div>
  );
}
