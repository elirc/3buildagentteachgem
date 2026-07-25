import React from 'react';
import { notFound } from 'next/navigation';
import { db } from '@/db';
import { getActiveUser } from '@/shared/auth';
import { formatDate } from '@/shared';
import { calculateSectionGrade, calculateClassAverage, classifyGradeScore } from '@/domain/rules/grades';
import Link from 'next/link';

export const revalidate = 0;

/**
 * The gradebook grid: students down, assignments across.
 *
 * The whole page is a pivot. Three queries land the data, everything else is
 * in-memory reshaping. The rule that makes this cheap is simple: never query
 * inside a render loop. A cell lookup that hits the database is a query per
 * student per assignment — a 25x10 class would issue 250 of them.
 */

type CellState = 'graded' | 'awaiting' | 'missing' | 'notStarted' | 'absent';

const CELL_STYLES: Record<CellState, { bg: string; fg: string; label: string }> = {
  graded: { bg: 'var(--color-success-bg, #dcfce7)', fg: 'var(--color-success)', label: 'Graded' },
  awaiting: { bg: 'var(--color-warning-bg, #fef9c3)', fg: 'var(--color-warning-text)', label: 'Submitted, not yet graded' },
  missing: { bg: 'var(--color-risk-critical-bg)', fg: 'var(--color-danger-text)', label: 'Missing' },
  notStarted: { bg: 'var(--color-bg)', fg: 'var(--color-text-muted)', label: 'Not started' },
  absent: { bg: 'transparent', fg: 'var(--color-text-light)', label: 'No submission row — student joined after this was published' },
};

function cellStateFor(status: string | undefined): CellState {
  if (!status) return 'absent';
  if (status === 'Graded' || status === 'Returned') return 'graded';
  if (status === 'Submitted' || status === 'Late') return 'awaiting';
  if (status === 'Missing') return 'missing';
  return 'notStarted';
}

export default async function GradebookPage({ params }: { params: { id: string } }) {
  const sectionId = params.id;
  await getActiveUser();

  // Query 1: the section and its enrolled roster.
  const section = await db.classSection.findUnique({
    where: { id: sectionId },
    include: {
      course: true,
      teacher: true,
      enrollments: {
        where: { status: 'Enrolled' },
        include: { student: true },
      },
    },
  });

  if (!section) notFound();

  const roster = [...section.enrollments].sort((a, b) =>
    `${a.student.lastName} ${a.student.firstName}`.localeCompare(`${b.student.lastName} ${b.student.firstName}`)
  );

  // Query 2: the columns. Drafts are excluded — they are not visible to
  // students and have no submission rows, so a Draft column would be empty by
  // definition and only add noise.
  const assignments = await db.assignment.findMany({
    where: { classSectionId: sectionId, status: { in: ['Published', 'Closed'] } },
    orderBy: { dueDate: 'asc' },
  });

  // Query 3: every cell, in one round trip.
  const submissions = assignments.length
    ? await db.submission.findMany({
        where: { assignmentId: { in: assignments.map((a) => a.id) } },
      })
    : [];

  // The lookup that makes the render O(1) per cell.
  const cellIndex = new Map(submissions.map((s) => [`${s.studentId}:${s.assignmentId}`, s]));

  const pointsById = new Map(assignments.map((a) => [a.id, a.pointsPossible]));

  // Per-student average, scoped to THIS section only. The risk badges elsewhere
  // in the app pool every section together (gotcha B3); a gradebook must not.
  const studentAverages = roster.map((e) => {
    const own = submissions.filter((s) => s.studentId === e.studentId);
    const grade = calculateSectionGrade(
      own.map((s) => ({
        status: s.status,
        score: s.score,
        pointsPossible: pointsById.get(s.assignmentId) ?? 0,
      }))
    );
    return { studentId: e.studentId, grade };
  });

  const averageByStudent = new Map(studentAverages.map((s) => [s.studentId, s.grade]));

  // Per-assignment class average across graded work only.
  const assignmentAverages = new Map(
    assignments.map((a) => {
      const graded = submissions.filter(
        (s) => s.assignmentId === a.id && (s.status === 'Graded' || s.status === 'Returned')
      );
      const percentages = graded.map((s) => ((s.score ?? 0) / a.pointsPossible) * 100);
      return [a.id, { average: calculateClassAverage(percentages), gradedCount: graded.length }];
    })
  );

  const classAverage = calculateClassAverage(
    studentAverages.filter((s) => s.grade.totalPointsPossible > 0).map((s) => s.grade.percentage)
  );

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>

      <div>
        <div style={{ display: 'flex', gap: '8px', fontSize: '0.8rem', color: 'var(--color-text-muted)', marginBottom: '4px' }}>
          <Link href="/sections">Class Roster Sections</Link>
          <span>/</span>
          <Link href={`/sections/${sectionId}`}>{section.course.code}</Link>
          <span>/</span>
          <span style={{ color: 'var(--color-text-main)' }}>Gradebook</span>
        </div>
        <h2 style={{ fontFamily: "'Outfit', sans-serif", fontSize: '1.8rem', fontWeight: 700, margin: 0 }}>
          Gradebook — {section.course.title}
        </h2>
        <p style={{ margin: 0, color: 'var(--color-text-muted)', fontSize: '0.9rem' }}>
          {section.term} · {section.teacher.firstName} {section.teacher.lastName} ·{' '}
          {roster.length} enrolled · {assignments.length} published assignment{assignments.length === 1 ? '' : 's'}
          {' · '}class average <strong>{classAverage}%</strong>
        </p>
      </div>

      {/* LEGEND — the grid is colour-coded, so the colours need naming. */}
      <div className="card" style={{ display: 'flex', gap: '20px', alignItems: 'center', padding: '12px 20px', flexWrap: 'wrap', fontSize: '0.75rem' }}>
        <span style={{ fontWeight: 600, color: 'var(--color-text-muted)' }}>Legend:</span>
        {(['graded', 'awaiting', 'missing', 'notStarted', 'absent'] as CellState[]).map((state) => (
          <span key={state} style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <span style={{
              width: '14px', height: '14px', borderRadius: '3px',
              backgroundColor: CELL_STYLES[state].bg,
              border: '1px solid var(--color-border)',
              display: 'inline-block',
            }} />
            {CELL_STYLES[state].label}
          </span>
        ))}
      </div>

      {assignments.length === 0 || roster.length === 0 ? (
        <div className="card" style={{ textAlign: 'center', padding: '40px', color: 'var(--color-text-muted)', fontSize: '0.9rem' }}>
          {roster.length === 0
            ? 'No students enrolled in this section yet.'
            : 'No published assignments yet. Create and publish coursework from the section page.'}
          <div style={{ marginTop: '16px' }}>
            <Link href={`/sections/${sectionId}`} className="btn btn-secondary btn-sm">Back to section</Link>
          </div>
        </div>
      ) : (
        /* The grid must scroll inside its own container: a 15-assignment class
           would otherwise push the whole page sideways. */
        <div className="card" style={{ padding: 0, overflowX: 'auto' }}>
          <table className="data-table" style={{ marginBottom: 0, minWidth: '100%' }}>
            <thead>
              <tr>
                <th style={{ position: 'sticky', left: 0, backgroundColor: '#ffffff', zIndex: 2, minWidth: '180px' }}>
                  Student
                </th>
                {assignments.map((a) => (
                  <th key={a.id} style={{ textAlign: 'center', minWidth: '110px' }}>
                    <div style={{ fontSize: '0.75rem' }}>{a.title}</div>
                    <div style={{ fontWeight: 400, fontSize: '0.65rem', color: 'var(--color-text-muted)' }}>
                      {a.type} · {a.pointsPossible}pt · due {formatDate(a.dueDate)}
                    </div>
                  </th>
                ))}
                <th style={{ textAlign: 'center', minWidth: '90px' }}>Average</th>
              </tr>
            </thead>

            <tbody>
              {roster.map((e) => {
                const avg = averageByStudent.get(e.studentId);
                return (
                  <tr key={e.id}>
                    <td style={{ position: 'sticky', left: 0, backgroundColor: '#ffffff', zIndex: 1 }}>
                      <Link href={`/students/${e.studentId}`} style={{ fontWeight: 600 }}>
                        {e.student.lastName}, {e.student.firstName}
                      </Link>
                      <div style={{ fontSize: '0.7rem', color: 'var(--color-text-muted)' }}>
                        <code>{e.student.studentNumber}</code>
                      </div>
                    </td>

                    {assignments.map((a) => {
                      const sub = cellIndex.get(`${e.studentId}:${a.id}`);
                      const state = cellStateFor(sub?.status);
                      const style = CELL_STYLES[state];

                      return (
                        <td key={a.id} style={{ textAlign: 'center', backgroundColor: style.bg, padding: '8px 4px' }}>
                          {state === 'absent' ? (
                            <span style={{ color: style.fg }} title={style.label}>—</span>
                          ) : state === 'graded' ? (
                            <strong style={{ color: style.fg }}>
                              {sub?.score ?? 0}<span style={{ fontWeight: 400, color: 'var(--color-text-muted)' }}>/{a.pointsPossible}</span>
                            </strong>
                          ) : state === 'awaiting' ? (
                            <Link
                              href={`/sections/${sectionId}`}
                              title="Submitted and awaiting a grade — open the grading cockpit"
                              style={{ color: style.fg, fontWeight: 600, fontSize: '0.8rem' }}
                            >
                              grade →
                            </Link>
                          ) : state === 'missing' ? (
                            <span style={{ color: style.fg, fontWeight: 700 }} title={style.label}>0</span>
                          ) : (
                            <span style={{ color: style.fg, fontSize: '0.75rem' }} title={style.label}>·</span>
                          )}
                        </td>
                      );
                    })}

                    <td style={{ textAlign: 'center' }}>
                      <strong>{avg?.percentage ?? 0}%</strong>
                      <div style={{ fontSize: '0.65rem', color: 'var(--color-text-muted)' }}>
                        {classifyGradeScore(avg?.percentage ?? 0)}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>

            <tfoot>
              <tr style={{ borderTop: '2px solid var(--color-border)', fontWeight: 600 }}>
                <td style={{ position: 'sticky', left: 0, backgroundColor: 'var(--color-bg)', zIndex: 1 }}>
                  Class average
                </td>
                {assignments.map((a) => {
                  const stat = assignmentAverages.get(a.id);
                  return (
                    <td key={a.id} style={{ textAlign: 'center', backgroundColor: 'var(--color-bg)', fontSize: '0.8rem' }}>
                      {stat && stat.gradedCount > 0 ? (
                        <>
                          {stat.average}%
                          <div style={{ fontSize: '0.65rem', fontWeight: 400, color: 'var(--color-text-muted)' }}>
                            n={stat.gradedCount}
                          </div>
                        </>
                      ) : (
                        <span style={{ color: 'var(--color-text-light)', fontWeight: 400 }}>—</span>
                      )}
                    </td>
                  );
                })}
                <td style={{ textAlign: 'center', backgroundColor: 'var(--color-bg)' }}>{classAverage}%</td>
              </tr>
            </tfoot>
          </table>
        </div>
      )}
    </div>
  );
}
