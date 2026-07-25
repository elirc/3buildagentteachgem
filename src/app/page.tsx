import React from 'react';
import { db } from '@/db';
import { getActiveUser } from '@/shared/auth';
import { buildStudentScope, describeStudentScope } from '@/shared/scope';
import { formatDate, formatDateTime, getRiskBadgeStyle } from '@/shared';
import { calculateSectionGrade } from '@/domain/rules/grades';
import { calculateStudentRisk, compareByRiskSeverity, isEscalationWorthy } from '@/domain/rules/risk';
import Link from 'next/link';

export const revalidate = 0; // Disable static caching so dashboard displays real-time updates!

export default async function DashboardPage() {
  const activeUser = await getActiveUser();

  // 1. Fetch count stats
  const activeStudentsCount = await db.student.count({ where: { enrollmentStatus: 'Active' } });
  const activeTeachersCount = await db.teacher.count({ where: { employmentStatus: 'Active' } });
  const activeSectionsCount = await db.classSection.count({ where: { status: 'Active' } });
  
  // 2. Fetch failed background jobs
  const failedJobsCount = await db.backgroundJob.count({ where: { status: 'Failed' } });

  // Dead letters are counted separately from failures on purpose: a Failed job will
  // be retried, a DeadLettered one never will unless a human intervenes. Rolling
  // them into one number hides the only one that actually needs a person.
  const deadLetteredJobsCount = await db.backgroundJob.count({ where: { status: 'DeadLettered' } });
  
  // 3. Fetch ungraded submissions count
  const ungradedSubmissionsCount = await db.submission.count({ where: { status: 'Submitted' } });

  // 4. Calculate risk scores for all students in real time to summarize on Dashboard!
  // To avoid performance issues in huge databases, enterprise platforms use computed caches, 
  // but for a mid-sized monolith of 4-100 students, calculating in real-time is instant and displays 100% correct data!
  // The risk distribution respects the same scope as /students, so a Student
  // role sees their own status rather than the whole school's.
  const studentScope = buildStudentScope(activeUser);
  const scopeNote = describeStudentScope(activeUser);

  const students = await db.student.findMany({
    where: studentScope,
    include: {
      attendance: true,
      submissions: { include: { assignment: true } },
      // createdByUser is needed so the urgent-case banner can name a human rather
      // than print a UUID. It costs one join and saves an N+1 in the render.
      interventionPlans: { where: { status: 'Active' }, include: { createdByUser: true } },
    },
  });

  // Assess every student once, then reuse the results for both the distribution
  // bars and the urgent-case banner. The previous version threw these away and
  // only kept counters, which is why the banner had to be hardcoded.
  const assessments = students.map((stu) => {
    const gradeCalc = calculateSectionGrade(
      stu.submissions.map((s) => ({
        status: s.status,
        score: s.score,
        pointsPossible: s.assignment.pointsPossible,
      }))
    );
    const absences = stu.attendance.filter((a) => a.status === 'Absent').length;
    const tardies = stu.attendance.filter((a) => a.status === 'Tardy').length;

    const risk = calculateStudentRisk({
      gradeAverage: gradeCalc.percentage,
      missingAssignmentsCount: gradeCalc.missingCount,
      absencesCount: absences,
      tardiesCount: tardies,
    });

    return { student: stu, risk, gradeCalc, absences, tardies };
  });

  const criticalRiskCount = assessments.filter((a) => a.risk.overallRiskLevel === 'Critical').length;
  const highRiskCount = assessments.filter((a) => a.risk.overallRiskLevel === 'High').length;
  const mediumRiskCount = assessments.filter((a) => a.risk.overallRiskLevel === 'Medium').length;
  const lowRiskCount = assessments.filter((a) => a.risk.overallRiskLevel === 'Low').length;

  // Most urgent case first. Guarded with a length check because [...].sort()[0] on an
  // empty roster is undefined, and an empty school is a legitimate state.
  const ranked = [...assessments].sort((a, b) =>
    compareByRiskSeverity(
      { riskLevel: a.risk.overallRiskLevel, gradeAverage: a.gradeCalc.percentage, absencesCount: a.absences },
      { riskLevel: b.risk.overallRiskLevel, gradeAverage: b.gradeCalc.percentage, absencesCount: b.absences }
    )
  );
  const urgentCase = ranked.length > 0 && isEscalationWorthy(ranked[0].risk.overallRiskLevel) ? ranked[0] : null;
  const urgentPlan = urgentCase?.student.interventionPlans[0] ?? null;

  // 5. Fetch latest Agent Runs
  const latestRuns = await db.agentRun.findMany({
    orderBy: { createdAt: 'desc' },
    take: 4,
  });

  // 6. Fetch recent Audit Events
  const recentAudits = await db.auditEvent.findMany({
    orderBy: { createdAt: 'desc' },
    take: 5,
  });

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '32px' }}>
      
      {/* Page Title Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <h2 style={{ fontFamily: "'Outfit', sans-serif", fontSize: '1.8rem', fontWeight: 700, margin: 0 }}>
            Operations Cockpit
          </h2>
          <p style={{ margin: 0, color: 'var(--color-text-muted)', fontSize: '0.9rem' }}>
            System overview and instructional diagnostics for school managers, advisors, and admin roles.
          </p>
          {scopeNote && (
            <p style={{ margin: '4px 0 0 0', fontSize: '0.8rem', color: 'var(--color-primary)', fontWeight: 600 }}>
              🔒 {scopeNote}
            </p>
          )}
        </div>
        <div style={{ fontSize: '0.85rem', color: 'var(--color-text-muted)' }}>
          Active Session: <strong>{activeUser.role}</strong>
        </div>
      </div>

      {/* CORE PERFORMANCE INDICATOR CARDS */}
      <div className="grid-4">
        
        <div className="card" style={{ display: 'flex', alignItems: 'center', gap: '16px', borderLeft: '4px solid var(--color-primary)' }}>
          <span style={{ fontSize: '2.2rem' }}>👨‍🎓</span>
          <div>
            <span style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--color-text-muted)', textTransform: 'uppercase' }}>Active Students</span>
            <h3 style={{ fontSize: '1.8rem', margin: 0 }}>{activeStudentsCount}</h3>
          </div>
        </div>

        <div className="card" style={{ display: 'flex', alignItems: 'center', gap: '16px', borderLeft: '4px solid var(--color-success)' }}>
          <span style={{ fontSize: '2.2rem' }}>🏫</span>
          <div>
            <span style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--color-text-muted)', textTransform: 'uppercase' }}>Class Sections</span>
            <h3 style={{ fontSize: '1.8rem', margin: 0 }}>{activeSectionsCount}</h3>
          </div>
        </div>

        <div className="card" style={{ display: 'flex', alignItems: 'center', gap: '16px', borderLeft: '4px solid var(--color-warning)' }}>
          <span style={{ fontSize: '2.2rem' }}>📝</span>
          <div>
            <span style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--color-text-muted)', textTransform: 'uppercase' }}>Ungraded Backlog</span>
            <h3 style={{ fontSize: '1.8rem', margin: 0, color: ungradedSubmissionsCount > 3 ? 'var(--color-danger)' : 'var(--color-text-main)' }}>
              {ungradedSubmissionsCount}
            </h3>
          </div>
        </div>

        <div className="card" style={{ display: 'flex', alignItems: 'center', gap: '16px', borderLeft: '4px solid var(--color-danger)' }}>
          <span style={{ fontSize: '2.2rem' }}>⚙️</span>
          <div>
            <span style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--color-text-muted)', textTransform: 'uppercase' }}>Failed Jobs</span>
            <h3 style={{ fontSize: '1.8rem', margin: 0, color: failedJobsCount > 0 ? 'var(--color-danger)' : 'var(--color-text-main)' }}>
              {failedJobsCount}
            </h3>
            {deadLetteredJobsCount > 0 && (
              <Link href="/jobs" style={{ fontSize: '0.7rem', fontWeight: 700, color: 'var(--color-danger-text)' }}>
                ☠️ {deadLetteredJobsCount} dead-lettered →
              </Link>
            )}
          </div>
        </div>

      </div>

      {/* DUAL COLUMN SYSTEM: LEFT FOR ACADEMIC RISK, RIGHT FOR AUDITS AND LOGS */}
      <div style={{ display: 'flex', gap: '32px', width: '100%' }}>
        
        {/* LEFT COLUMN: ACADEMIC RISK TIER DISTRIBUTION */}
        <div style={{ flex: 1.3, display: 'flex', flexDirection: 'column', gap: '24px' }}>
          
          <div className="card">
            <h3 style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '1.1rem', marginBottom: '16px' }}>
              <span>⚠️ Academic Risk Distribution</span>
              <Link href="/students" style={{ fontSize: '0.8rem', fontWeight: 600 }}>View All Students →</Link>
            </h3>
            
            <p style={{ fontSize: '0.85rem', marginBottom: '24px' }}>
              Student risk calculations combine grade percentages, absences, and missing homework to isolate critical concerns.
            </p>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              
              {/* Critical */}
              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.85rem', marginBottom: '4px', fontWeight: 600 }}>
                  <span style={{ color: 'var(--color-risk-critical-text)' }}>🚨 Critical Risk (Requires Action)</span>
                  <span>{criticalRiskCount} {criticalRiskCount === 1 ? 'student' : 'students'}</span>
                </div>
                <div style={{ height: '8px', backgroundColor: '#e2e8f0', borderRadius: '4px', overflow: 'hidden' }}>
                  <div style={{
                    width: `${criticalRiskCount ? (criticalRiskCount / students.length) * 100 : 0}%`,
                    height: '100%',
                    backgroundColor: 'var(--color-danger)'
                  }} />
                </div>
              </div>

              {/* High */}
              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.85rem', marginBottom: '4px', fontWeight: 600 }}>
                  <span style={{ color: 'var(--color-risk-high-text)' }}>⚠️ High Risk</span>
                  <span>{highRiskCount} {highRiskCount === 1 ? 'student' : 'students'}</span>
                </div>
                <div style={{ height: '8px', backgroundColor: '#e2e8f0', borderRadius: '4px', overflow: 'hidden' }}>
                  <div style={{
                    width: `${highRiskCount ? (highRiskCount / students.length) * 100 : 0}%`,
                    height: '100%',
                    backgroundColor: 'var(--color-warning)'
                  }} />
                </div>
              </div>

              {/* Medium */}
              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.85rem', marginBottom: '4px', fontWeight: 600 }}>
                  <span style={{ color: 'var(--color-risk-medium-text)' }}>🔔 Medium Risk</span>
                  <span>{mediumRiskCount} {mediumRiskCount === 1 ? 'student' : 'students'}</span>
                </div>
                <div style={{ height: '8px', backgroundColor: '#e2e8f0', borderRadius: '4px', overflow: 'hidden' }}>
                  <div style={{
                    width: `${mediumRiskCount ? (mediumRiskCount / students.length) * 100 : 0}%`,
                    height: '100%',
                    backgroundColor: 'hsl(45, 90%, 50%)'
                  }} />
                </div>
              </div>

              {/* Low */}
              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.85rem', marginBottom: '4px', fontWeight: 600 }}>
                  <span style={{ color: 'var(--color-risk-low-text)' }}>✅ Low Risk / Stable</span>
                  <span>{lowRiskCount} {lowRiskCount === 1 ? 'student' : 'students'}</span>
                </div>
                <div style={{ height: '8px', backgroundColor: '#e2e8f0', borderRadius: '4px', overflow: 'hidden' }}>
                  <div style={{
                    width: `${lowRiskCount ? (lowRiskCount / students.length) * 100 : 0}%`,
                    height: '100%',
                    backgroundColor: 'var(--color-success)'
                  }} />
                </div>
              </div>

            </div>

            {/* Highest-risk student, computed from live data. Nothing here is hardcoded:
                if this card names someone, the risk engine put them there. */}
            {urgentCase && (
              <div style={{
                marginTop: '24px',
                padding: '16px',
                backgroundColor: 'var(--color-risk-critical-bg)',
                borderRadius: 'var(--radius-sm)',
                border: '1px solid var(--color-danger)'
              }}>
                <div style={{ display: 'flex', gap: '12px' }}>
                  <span style={{ fontSize: '1.2rem' }}>⚠️</span>
                  <div>
                    <h4 style={{ margin: 0, color: 'var(--color-risk-critical-text)', fontWeight: 700, fontSize: '0.875rem' }}>
                      Urgent Case Attention: {urgentCase.student.firstName} {urgentCase.student.lastName}
                    </h4>
                    <p style={{ margin: '4px 0 0 0', fontSize: '0.8rem', color: 'var(--color-text-main)', lineHeight: 1.4 }}>
                      Student <strong>{urgentCase.student.firstName} {urgentCase.student.lastName}</strong> is
                      classified as <strong>{urgentCase.risk.overallRiskLevel} Risk</strong> with a
                      section average of <strong>{urgentCase.gradeCalc.percentage}%</strong>,{' '}
                      <strong>{urgentCase.gradeCalc.missingCount} missing {urgentCase.gradeCalc.missingCount === 1 ? 'assignment' : 'assignments'}</strong> and{' '}
                      <strong>{urgentCase.absences} {urgentCase.absences === 1 ? 'absence' : 'absences'}</strong>.
                      Primary risk area: <strong>{urgentCase.risk.primaryRiskArea}</strong>.
                    </p>

                    {/* The evidence strings come straight out of calculateStudentRisk, so the
                        banner can never disagree with the rule that classified the student. */}
                    <ul style={{ margin: '8px 0 0 0', paddingLeft: '18px', fontSize: '0.75rem', color: 'var(--color-text-main)', lineHeight: 1.5 }}>
                      {urgentCase.risk.evidence.slice(0, 2).map((line, i) => (
                        <li key={i}>{line}</li>
                      ))}
                    </ul>

                    <p style={{ margin: '8px 0 0 0', fontSize: '0.75rem', color: 'var(--color-text-main)' }}>
                      {urgentPlan ? (
                        <>
                          Active intervention plan <strong>&ldquo;{urgentPlan.summary}&rdquo;</strong> opened
                          by <strong>{urgentPlan.createdByUser.name}</strong>.
                        </>
                      ) : (
                        <strong style={{ color: 'var(--color-danger-text)' }}>No intervention plan on file.</strong>
                      )}
                    </p>

                    <div style={{ marginTop: '12px' }}>
                      <Link href={`/students/${urgentCase.student.id}`} style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--color-danger-text)', textDecoration: 'underline' }}>
                        {urgentPlan
                          ? `Investigate ${urgentCase.student.firstName}'s student file →`
                          : `Open ${urgentCase.student.firstName}'s file and start a plan →`}
                      </Link>
                    </div>
                  </div>
                </div>
              </div>
            )}

          </div>

          {/* LATEST AGENT FINDINGS */}
          <div className="card">
            <h3 style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '1.1rem', marginBottom: '16px' }}>
              <span>🤖 Latest Agent Insights</span>
              <Link href="/agent-runs" style={{ fontSize: '0.8rem', fontWeight: 600 }}>All Executions →</Link>
            </h3>

            {latestRuns.length === 0 ? (
              <p style={{ fontSize: '0.85rem', color: 'var(--color-text-muted)', margin: 0 }}>
                No agent runs recorded yet. Go to Student, Teacher, or Submission profiles to run academic insight agents.
              </p>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                {latestRuns.map((run) => {
                  const out = run.outputJSON ? JSON.parse(run.outputJSON) : null;
                  return (
                    <div key={run.id} style={{
                      padding: '16px',
                      backgroundColor: 'var(--color-bg)',
                      border: '1px solid var(--color-border-light)',
                      borderRadius: 'var(--radius-sm)'
                    }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                        <span style={{
                          fontSize: '0.7rem',
                          backgroundColor: 'var(--color-primary-light)',
                          color: 'var(--color-primary)',
                          padding: '2px 8px',
                          borderRadius: '9999px',
                          fontWeight: 700
                        }}>{run.agentType.replace(/([A-Z])/g, ' $1').trim()}</span>
                        <span style={{ fontSize: '0.7rem', color: 'var(--color-text-muted)' }}>
                          Confidence: <strong>{run.confidenceScore ? Math.round(run.confidenceScore * 100) + '%' : 'N/A'}</strong>
                        </span>
                      </div>
                      
                      <p style={{ fontSize: '0.85rem', color: 'var(--color-text-main)', margin: '4px 0 8px 0', lineHeight: 1.4, fontWeight: 500 }}>
                        {out?.summary || 'Executing...'}
                      </p>
                      
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '0.75rem' }}>
                        <span style={{ color: 'var(--color-text-light)' }}>Target: {run.targetType}:{run.targetId.substring(0, 8)}...</span>
                        <Link href={`/agent-runs/${run.id}`} style={{ fontWeight: 600, textDecoration: 'underline' }}>
                          View Reasoning Trace →
                        </Link>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

        </div>

        {/* RIGHT COLUMN: RECENT AUDIT TIMELINE AND OBSERVABILITY LOGS */}
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '24px' }}>
          
          {/* AUDIT EVENT TIMELINE */}
          <div className="card">
            <h3 style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '1.1rem', marginBottom: '16px' }}>
              <span>🔐 Transaction Audit Trail</span>
              <Link href="/audits" style={{ fontSize: '0.8rem', fontWeight: 600 }}>Full Audit Log →</Link>
            </h3>

            <p style={{ fontSize: '0.85rem', marginBottom: '20px' }}>
              Audit events trace precise actor accounts and system state changes, verifying complete data integrity.
            </p>

            <div className="timeline">
              {recentAudits.map((evt) => (
                <div key={evt.id} className="timeline-item active">
                  <div className="timeline-time">{formatDateTime(evt.createdAt)}</div>
                  <div className="timeline-title" style={{ fontSize: '0.85rem', fontWeight: 600 }}>
                    <code>{evt.action}</code>
                  </div>
                  <div className="timeline-desc" style={{ fontSize: '0.8rem', color: 'var(--color-text-muted)', marginTop: '2px' }}>
                    Actor: <strong>{evt.actorId === 'system' ? '💻 System Engine' : evt.actorId.substring(0, 8)}</strong> on {evt.entityType} ({evt.entityId.substring(0, 8)})
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* SYSTEM OBSERVE LOG LINKS */}
          <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            <h3 style={{ fontSize: '1.1rem', margin: 0 }}>🔍 Log Diagnostics Explorer</h3>
            <p style={{ fontSize: '0.85rem', color: 'var(--color-text-muted)', margin: 0 }}>
              Audit raw log streams generated by academic triggers, email notification loops, and background cron simulations.
            </p>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
              <Link href="/logs" className="btn btn-secondary btn-sm" style={{ flex: 1, textAlign: 'center' }}>
                📝 Open Log Explorer
              </Link>
              <Link href="/jobs" className="btn btn-secondary btn-sm" style={{ flex: 1, textAlign: 'center' }}>
                ⚙️ background worker Jobs
              </Link>
            </div>
          </div>

        </div>

      </div>

    </div>
  );
}
