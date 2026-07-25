import React from 'react';
import { db } from '@/db';
import { getActiveUser } from '@/shared/auth';
import { buildStudentScope, describeStudentScope } from '@/shared/scope';
import { formatDate, getRiskBadgeStyle, canPerformAction, lockMessage } from '@/shared';
import { calculateSectionGrade } from '@/domain/rules/grades';
import { calculateStudentRisk } from '@/domain/rules/risk';
import { recordAuditEvent } from '@/observability/audit';
import { revalidatePath } from 'next/cache';
import Link from 'next/link';

export const revalidate = 0;

export default async function StudentsListPage() {
  const activeUser = await getActiveUser();

  // Handle new student creation inline for quick testing
  async function createStudentAction(formData: FormData) {
    'use server';
    const activeSession = await getActiveUser();
    const firstName = formData.get('firstName') as string;
    const lastName = formData.get('lastName') as string;
    const email = formData.get('email') as string;
    const gradeLevel = formData.get('gradeLevel') as string;
    const studentNumber = formData.get('studentNumber') as string;
    const guardianName = formData.get('guardianName') as string;
    const guardianEmail = formData.get('guardianEmail') as string;

    const student = await db.student.create({
      data: {
        firstName,
        lastName,
        email,
        gradeLevel,
        enrollmentStatus: 'Active',
        studentNumber,
        guardianName,
        guardianEmail,
      },
    });

    await recordAuditEvent({
      actorId: activeSession.id,
      action: 'student.create',
      entityType: 'Student',
      entityId: student.id,
      after: student,
    });

    revalidatePath('/students');
  }

  // Fetch students with all details
  // Scoped in the WHERE clause, not filtered afterwards. A post-fetch filter
  // silently breaks the moment someone adds a take() or a count().
  const scope = buildStudentScope(activeUser);
  const scopeNote = describeStudentScope(activeUser);

  const students = await db.student.findMany({
    where: scope,
    include: {
      attendance: true,
      submissions: { include: { assignment: true } },
    },
    orderBy: { lastName: 'asc' },
  });

  const studentsWithRisk = students.map((stu) => {
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

    return {
      ...stu,
      finalAverage: gradeCalc.percentage,
      missingCount: gradeCalc.missingCount,
      absences,
      riskAnalysis: risk,
    };
  });

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '32px' }}>
      
      <div>
        <h2 style={{ fontFamily: "'Outfit', sans-serif", fontSize: '1.8rem', fontWeight: 700, margin: 0 }}>
          Student Roster
        </h2>
        <p style={{ margin: 0, color: 'var(--color-text-muted)', fontSize: '0.9rem' }}>
          Monitor active student enrollment status, cumulative gradebook averages, absences, and real-time risk indicators.
        </p>
        {scopeNote && (
          <p style={{ margin: '6px 0 0 0', fontSize: '0.8rem', color: 'var(--color-primary)', fontWeight: 600 }}>
            🔒 {scopeNote}
          </p>
        )}
      </div>

      <div style={{ display: 'flex', gap: '32px' }}>
        
        {/* STUDENTS LIST TABLE */}
        <div style={{ flex: 2, display: 'flex', flexDirection: 'column', gap: '20px' }}>
          <div className="table-wrapper">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Student Name</th>
                  <th>Student Number</th>
                  <th>Grade Level</th>
                  <th>Section Average</th>
                  <th>Absences</th>
                  <th>Missing HW</th>
                  <th>Risk Tier</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {studentsWithRisk.map((stu) => {
                  const badge = getRiskBadgeStyle(stu.riskAnalysis.overallRiskLevel);
                  return (
                    <tr key={stu.id}>
                      <td>
                        <Link href={`/students/${stu.id}`} style={{ fontWeight: 600 }}>
                          {stu.firstName} {stu.lastName}
                        </Link>
                        <div style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)' }}>{stu.email}</div>
                      </td>
                      <td><code>{stu.studentNumber}</code></td>
                      <td>{stu.gradeLevel}</td>
                      <td><strong>{stu.finalAverage}%</strong></td>
                      <td>{stu.absences}</td>
                      <td style={{ color: stu.missingCount > 0 ? 'var(--color-danger)' : 'inherit' }}>
                        {stu.missingCount}
                      </td>
                      <td>
                        <span className="badge" style={{ backgroundColor: badge.bg, color: badge.text }}>
                          {stu.riskAnalysis.overallRiskLevel}
                        </span>
                      </td>
                      <td>
                        <Link href={`/students/${stu.id}`} className="btn btn-secondary btn-sm">
                          Details / Run Agents
                        </Link>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>

        {/* CREATE STUDENT FORM (RBAC restricted to SchoolManager / Admin) */}
        {canPerformAction(activeUser.role, 'student.create') ? (
          <div style={{ flex: 1 }}>
            <div className="card">
              <h3 style={{ fontSize: '1.1rem', marginBottom: '16px' }}>➕ Create Student Profile</h3>
              <form action={createStudentAction} style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                
                <div className="form-group">
                  <label className="form-label">First Name</label>
                  <input name="firstName" className="form-control" placeholder="Maya" required />
                </div>

                <div className="form-group">
                  <label className="form-label">Last Name</label>
                  <input name="lastName" className="form-control" placeholder="Johnson" required />
                </div>

                <div className="form-group">
                  <label className="form-label">School Email</label>
                  <input name="email" type="email" className="form-control" placeholder="maya.johnson@example.com" required />
                </div>

                <div className="form-group">
                  <label className="form-label">Grade Level</label>
                  <select name="gradeLevel" className="form-control" required>
                    <option value="9th Grade">9th Grade</option>
                    <option value="10th Grade">10th Grade</option>
                    <option value="11th Grade">11th Grade</option>
                    <option value="12th Grade">12th Grade</option>
                  </select>
                </div>

                <div className="form-group">
                  <label className="form-label">Student ID Number</label>
                  <input name="studentNumber" className="form-control" placeholder="STU-2026-0099" required />
                </div>

                <div className="form-group">
                  <label className="form-label">Guardian Full Name</label>
                  <input name="guardianName" className="form-control" placeholder="Lisa Johnson" required />
                </div>

                <div className="form-group">
                  <label className="form-label">Guardian Email</label>
                  <input name="guardianEmail" type="email" className="form-control" placeholder="lisa.johnson@example.com" required />
                </div>

                <button type="submit" className="btn btn-primary" style={{ marginTop: '8px' }}>
                  Register Student
                </button>
              </form>
            </div>
          </div>
        ) : (
          <div style={{ flex: 1 }}>
            <div className="card" style={{ backgroundColor: 'var(--color-bg)', borderStyle: 'dashed' }}>
              <span style={{ fontSize: '1.2rem', display: 'block', marginBottom: '8px' }}>🔐 Admin Panel</span>
              <p style={{ fontSize: '0.8rem', color: 'var(--color-text-muted)', margin: 0, lineHeight: 1.4 }}>
                Creating new student profiles requires administrative permissions. Switch your active role to <strong>SchoolManager</strong> or <strong>Admin</strong> in the header cockpit to unlock this panel.
              </p>
            </div>
          </div>
        )}

      </div>

    </div>
  );
}
