import React from 'react';
import { notFound } from 'next/navigation';
import { db } from '@/db';
import { getActiveUser } from '@/shared/auth';
import { formatDate, formatDateTime, parseSubjects } from '@/shared';
import { calculateTeacherWorkload } from '@/domain/rules/workload';
import { calculateSectionGrade } from '@/domain/rules/grades';
import { runAgentAction, updateTeacherStatusAction } from '../../actions';
import Link from 'next/link';

export const revalidate = 0;

const EMPLOYMENT_STATUSES = ['Active', 'OnLeave', 'Inactive'];

export default async function TeacherDetailPage({ params }: { params: { id: string } }) {
  const teacherId = params.id;
  const activeUser = await getActiveUser();

  // Query 1: the teacher and everything hanging off their sections.
  const teacher = await db.teacher.findUnique({
    where: { id: teacherId },
    include: {
      user: true,
      classSections: {
        include: {
          course: true,
          enrollments: { where: { status: 'Enrolled' }, select: { studentId: true } },
        },
        orderBy: { term: 'asc' },
      },
    },
  });

  // findUnique + notFound() rather than findUniqueOrThrow: a bad id in the URL
  // is a 404, not a 500. findUniqueOrThrow would surface a raw Prisma error.
  if (!teacher) notFound();

  const subjects = parseSubjects(teacher.subjectsJSON);
  const activeSections = teacher.classSections.filter((s) => s.status === 'Active');
  const activeSectionIds = activeSections.map((s) => s.id);
  const allSectionIds = teacher.classSections.map((s) => s.id);

  // Query 2: every submission across every section this teacher owns, once.
  //
  // The /teachers list page does this differently: for each teacher it loops
  // over each enrolled student and issues a query per student. That is the N+1
  // in gotcha D. Here the whole dataset arrives in one round trip and the
  // grouping happens in memory, which is O(1) queries regardless of roster size.
  const submissions = await db.submission.findMany({
    where: { assignment: { classSectionId: { in: allSectionIds } } },
    include: {
      assignment: { select: { pointsPossible: true, title: true, classSectionId: true } },
      student: { select: { id: true, firstName: true, lastName: true } },
    },
    orderBy: { submittedAt: 'asc' },
  });

  // Grading backlog: submitted, awaiting a grade, oldest first.
  const backlog = submissions.filter((s) => s.status === 'Submitted');

  // At-risk headcount across the teacher's *active* sections, matching the
  // workload rule's definition (below 70% overall).
  const activeStudentIds = new Set(
    activeSections.flatMap((s) => s.enrollments.map((e) => e.studentId))
  );

  const submissionsByStudent = submissions.reduce<Record<string, typeof submissions>>((acc, s) => {
    (acc[s.studentId] ||= []).push(s);
    return acc;
  }, {});

  let atRiskCount = 0;
  for (const studentId of activeStudentIds) {
    const grade = calculateSectionGrade(
      (submissionsByStudent[studentId] ?? []).map((s) => ({
        status: s.status,
        score: s.score,
        pointsPossible: s.assignment.pointsPossible,
      }))
    );
    if (grade.percentage < 70) atRiskCount++;
  }

  const workload = calculateTeacherWorkload({
    activeSectionsCount: activeSections.length,
    totalStudentsCapacity: activeSections.reduce((sum, s) => sum + s.capacity, 0),
    ungradedSubmissionsCount: backlog.filter((s) =>
      activeSectionIds.includes(s.assignment.classSectionId)
    ).length,
    atRiskStudentsCount: atRiskCount,
    teacherStatus: teacher.employmentStatus,
  });

  // Query 3: this teacher's agent history.
  const agentRuns = await db.agentRun.findMany({
    where: { agentType: 'TeacherWorkloadInsight', targetType: 'Teacher', targetId: teacherId },
    orderBy: { createdAt: 'desc' },
    take: 5,
  });

  const canManage = ['Admin', 'SchoolManager'].includes(activeUser.role);

  async function handleRunAgent() {
    'use server';
    await runAgentAction({
      agentType: 'TeacherWorkloadInsight',
      targetType: 'Teacher',
      targetId: teacherId,
      createdById: activeUser.id,
    });
  }

  async function handleStatusChange(formData: FormData) {
    'use server';
    await updateTeacherStatusAction({
      teacherId,
      employmentStatus: formData.get('employmentStatus') as string,
      actorId: activeUser.id,
    });
  }

  const workloadColour =
    workload.status === 'Critically Overloaded' ? 'var(--color-danger)'
      : workload.status === 'Overloaded' ? 'var(--color-warning)'
        : 'var(--color-success)';

  // An inactive teacher still holding live sections is an operational problem:
  // validateEnrollmentRules refuses every enrolment into those sections.
  const inactiveWithLiveSections =
    teacher.employmentStatus === 'Inactive' && activeSections.length > 0;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '32px' }}>

      {/* BREADCRUMB + HEADER */}
      <div>
        <div style={{ display: 'flex', gap: '8px', fontSize: '0.8rem', color: 'var(--color-text-muted)', marginBottom: '4px' }}>
          <Link href="/teachers">Teacher &amp; Staffing Workloads</Link>
          <span>/</span>
          <span style={{ color: 'var(--color-text-main)' }}>{teacher.lastName}</span>
        </div>
      </div>

      <div className="card" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '20px' }}>
          <span style={{ fontSize: '3rem' }}>👨‍🏫</span>
          <div>
            <h2 style={{ margin: 0, fontFamily: "'Outfit', sans-serif" }}>
              {teacher.firstName} {teacher.lastName}
            </h2>
            <div style={{ display: 'flex', gap: '12px', fontSize: '0.85rem', color: 'var(--color-text-muted)', marginTop: '4px' }}>
              <span>{teacher.department}</span>
              <span>•</span>
              <span>{teacher.officeLocation}</span>
              <span>•</span>
              <span>{teacher.email}</span>
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px', marginTop: '8px' }}>
              {subjects.length === 0 ? (
                <span style={{ fontSize: '0.7rem', color: 'var(--color-text-light)' }}>No subjects listed</span>
              ) : (
                subjects.map((s) => (
                  <span key={s} style={{
                    fontSize: '0.65rem', fontWeight: 600,
                    backgroundColor: 'var(--color-primary-light)', color: 'var(--color-primary)',
                    padding: '2px 8px', borderRadius: '9999px',
                  }}>{s}</span>
                ))
              )}
            </div>
          </div>
        </div>

        <div style={{ textAlign: 'right' }}>
          <span style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--color-text-muted)', textTransform: 'uppercase', display: 'block', marginBottom: '6px' }}>
            Employment
          </span>
          {canManage ? (
            <form action={handleStatusChange} style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
              <select name="employmentStatus" className="form-control" defaultValue={teacher.employmentStatus} style={{ padding: '4px 8px', fontSize: '0.8rem' }}>
                {EMPLOYMENT_STATUSES.map((s) => (
                  <option key={s} value={s}>{s}</option>
                ))}
              </select>
              <button type="submit" className="btn btn-secondary btn-sm">Update</button>
            </form>
          ) : (
            <span className="badge badge-neutral">{teacher.employmentStatus}</span>
          )}
        </div>
      </div>

      {inactiveWithLiveSections && (
        <div style={{
          padding: '12px 16px', backgroundColor: 'var(--color-risk-critical-bg)',
          border: '1px solid var(--color-danger)', borderRadius: 'var(--radius-sm)', fontSize: '0.85rem',
        }}>
          <strong>⚠️ Inactive teacher with {activeSections.length} live section{activeSections.length === 1 ? '' : 's'}.</strong>{' '}
          Enrolment into those sections is now blocked — <code>validateEnrollmentRules</code> rejects
          any section whose teacher is Inactive. Reassign the sections or restore the teacher.
        </div>
      )}

      <div style={{ display: 'flex', gap: '32px' }}>

        {/* LEFT: WORKLOAD + SECTIONS */}
        <div style={{ flex: 1.6, display: 'flex', flexDirection: 'column', gap: '32px' }}>

          <div className="card">
            <h3 style={{ fontSize: '1.1rem', marginBottom: '16px' }}>📊 Workload Analysis</h3>

            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.8rem', fontWeight: 600, marginBottom: '4px' }}>
              <span>{workload.status}</span>
              <span>{workload.workloadScore}/100</span>
            </div>
            <div style={{ height: '10px', backgroundColor: '#e2e8f0', borderRadius: '5px', overflow: 'hidden', marginBottom: '16px' }}>
              <div style={{ width: `${Math.min(100, workload.workloadScore)}%`, height: '100%', backgroundColor: workloadColour }} />
            </div>

            <div style={{ display: 'flex', gap: '12px', fontSize: '0.8rem', backgroundColor: 'var(--color-bg)', padding: '12px', borderRadius: 'var(--radius-sm)' }}>
              {[
                { label: 'Active Sections', value: activeSections.length },
                { label: 'Seats', value: activeSections.reduce((sum, s) => sum + s.capacity, 0) },
                { label: 'Grading Backlog', value: backlog.length },
                { label: 'At Risk', value: atRiskCount },
              ].map((m) => (
                <div key={m.label} style={{ flex: 1, textAlign: 'center' }}>
                  <strong style={{ display: 'block', fontSize: '1.1rem' }}>{m.value}</strong>
                  <span style={{ fontSize: '0.65rem', color: 'var(--color-text-muted)', textTransform: 'uppercase' }}>{m.label}</span>
                </div>
              ))}
            </div>

            {/* Every warning, not just the first. The list page shows warnings[0]
                only, which hides the other reasons a teacher is overloaded. */}
            {workload.warnings.length > 0 && (
              <ul style={{ marginTop: '16px', paddingLeft: '18px', fontSize: '0.8rem', color: 'var(--color-danger-text)', lineHeight: 1.6 }}>
                {workload.warnings.map((w, i) => (
                  <li key={i}>{w}</li>
                ))}
              </ul>
            )}
          </div>

          <div className="card">
            <h3 style={{ fontSize: '1.1rem', marginBottom: '16px' }}>
              🏫 All Class Sections ({teacher.classSections.length})
            </h3>

            {teacher.classSections.length === 0 ? (
              <p style={{ fontSize: '0.85rem', color: 'var(--color-text-muted)', margin: 0 }}>
                No sections assigned. This teacher has spare capacity.
              </p>
            ) : (
              <div className="table-wrapper" style={{ marginBottom: 0 }}>
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>Course</th><th>Term</th><th>Room</th><th>Roster</th><th>Backlog</th><th>Status</th><th></th>
                    </tr>
                  </thead>
                  <tbody>
                    {teacher.classSections.map((s) => {
                      const sectionBacklog = backlog.filter((b) => b.assignment.classSectionId === s.id).length;
                      return (
                        <tr key={s.id}>
                          <td>
                            <Link href={`/sections/${s.id}`} style={{ fontWeight: 600 }}>
                              {s.course.title} ({s.course.code})
                            </Link>
                          </td>
                          <td>{s.term}</td>
                          <td><code>{s.room}</code></td>
                          <td>{s.enrollments.length} / {s.capacity}</td>
                          <td style={{ color: sectionBacklog > 0 ? 'var(--color-danger)' : 'inherit' }}>{sectionBacklog}</td>
                          <td>
                            <span className={`badge ${s.status === 'Active' ? 'badge-success' : 'badge-neutral'}`}>{s.status}</span>
                          </td>
                          <td>
                            <Link href={`/sections/${s.id}/gradebook`} className="btn btn-secondary btn-sm">Gradebook</Link>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          <div className="card">
            <h3 style={{ fontSize: '1.1rem', marginBottom: '16px' }}>✍️ Grading Backlog ({backlog.length})</h3>
            {backlog.length === 0 ? (
              <p style={{ fontSize: '0.85rem', color: 'var(--color-text-muted)', margin: 0 }}>
                🎉 Nothing awaiting a grade.
              </p>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                {backlog.map((s) => (
                  <div key={s.id} style={{
                    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                    padding: '10px 12px', backgroundColor: 'var(--color-bg)',
                    borderRadius: 'var(--radius-sm)', fontSize: '0.85rem',
                  }}>
                    <div>
                      <strong>{s.student.firstName} {s.student.lastName}</strong>
                      <span style={{ color: 'var(--color-text-muted)' }}> — {s.assignment.title}</span>
                    </div>
                    <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
                      <span style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)' }}>
                        Submitted {s.submittedAt ? formatDate(s.submittedAt) : 'N/A'}
                      </span>
                      <Link href={`/sections/${s.assignment.classSectionId}`} className="btn btn-secondary btn-sm">Grade</Link>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* RIGHT: AGENT HISTORY */}
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '32px' }}>
          <div className="card" style={{ border: '2px solid var(--color-primary-hover)', backgroundColor: 'var(--color-primary-light)' }}>
            <h3 style={{ fontSize: '1.1rem', margin: 0, color: 'var(--color-primary-hover)' }}>
              🤖 Workload Insight Agent
            </h3>
            <p style={{ fontSize: '0.85rem', marginTop: '6px', marginBottom: '16px' }}>
              Runs the same <code>calculateTeacherWorkload</code> rule shown above, then turns its
              warnings into staffing recommendations with an owner and an urgency.
            </p>

            {canManage ? (
              <form action={handleRunAgent} style={{ marginBottom: '16px' }}>
                <button type="submit" className="btn btn-primary btn-sm">Run Workload Analysis 🚀</button>
              </form>
            ) : (
              <span style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)', display: 'block', marginBottom: '12px' }}>
                🔒 Switch to SchoolManager or Admin to run staffing diagnostics.
              </span>
            )}

            {agentRuns.length === 0 ? (
              <p style={{ fontSize: '0.8rem', color: 'var(--color-text-muted)', margin: 0 }}>
                No runs recorded for this teacher yet.
              </p>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                {agentRuns.map((run) => {
                  const out = run.outputJSON ? JSON.parse(run.outputJSON) : null;
                  return (
                    <div key={run.id} style={{
                      backgroundColor: '#ffffff', padding: '12px', borderRadius: 'var(--radius-sm)',
                      border: '1px solid var(--color-border)', fontSize: '0.8rem',
                    }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.7rem', fontWeight: 600, marginBottom: '4px' }}>
                        <span style={{ color: 'var(--color-primary)' }}>
                          Score {out?.metadata?.workloadScore ?? '—'} · {out?.metadata?.workloadStatus ?? run.status}
                        </span>
                        <span style={{ color: 'var(--color-text-muted)' }}>{formatDateTime(run.createdAt)}</span>
                      </div>
                      <p style={{ margin: 0, lineHeight: 1.4 }}>{out?.summary ?? run.errorMessage ?? 'Running…'}</p>
                      <div style={{ marginTop: '8px', textAlign: 'right' }}>
                        <Link href={`/agent-runs/${run.id}`} style={{ fontWeight: 600, textDecoration: 'underline', fontSize: '0.75rem' }}>
                          Open reasoning trace →
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
