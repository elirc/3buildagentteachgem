import React from 'react';
import { db } from '@/db';
import { getActiveUser } from '@/shared/auth';
import { buildStudentScope, describeStudentScope } from '@/shared/scope';
import { formatDate, canPerformAction, lockMessage } from '@/shared';
import { recordAuditEvent } from '@/observability/audit';
import { revalidatePath } from 'next/cache';
import Link from 'next/link';

export const revalidate = 0;

export default async function InterventionsListPage() {
  const activeUser = await getActiveUser();

  // Complete an intervention plan
  async function completePlanAction(formData: FormData) {
    'use server';
    const planId = formData.get('planId') as string;
    const activeSession = await getActiveUser();

    const before = await db.interventionPlan.findUniqueOrThrow({ where: { id: planId } });

    const plan = await db.interventionPlan.update({
      where: { id: planId },
      data: {
        status: 'Completed',
      },
    });

    await recordAuditEvent({
      actorId: activeSession.id,
      action: 'intervention.complete',
      entityType: 'InterventionPlan',
      entityId: planId,
      before,
      after: plan,
    });

    revalidatePath('/interventions');
  }

  // Fetch all intervention plans
  // Plans are scoped through their student, so the same rule governs both
  // pages and there is no second definition of "who may I see?".
  const scopeNote = describeStudentScope(activeUser);

  const plans = await db.interventionPlan.findMany({
    where: { student: buildStudentScope(activeUser) },
    include: {
      student: true,
      createdByUser: true,
    },
    orderBy: { createdAt: 'desc' },
  });

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '32px' }}>
      
      <div>
        <h2 style={{ fontFamily: "'Outfit', sans-serif", fontSize: '1.8rem', fontWeight: 700, margin: 0 }}>
          Support & Counseling Interventions
        </h2>
        <p style={{ margin: 0, color: 'var(--color-text-muted)', fontSize: '0.9rem' }}>
          Coordinate customized academic tutoring schedules, address absenteeism trends, and review active counseling case histories.
        </p>
        {scopeNote && (
          <p style={{ margin: '6px 0 0 0', fontSize: '0.8rem', color: 'var(--color-primary)', fontWeight: 600 }}>
            🔒 {scopeNote}
          </p>
        )}
      </div>

      <div className="table-wrapper">
        <table className="data-table">
          <thead>
            <tr>
              <th>Target Student</th>
              <th>Plan Summary</th>
              <th>Risk Vector</th>
              <th>Assigned Advisor</th>
              <th>Follow Up Date</th>
              <th>Action Items</th>
              <th>Case Status</th>
              <th>Roster Action</th>
            </tr>
          </thead>
          <tbody>
            {plans.map((p) => {
              const isActive = p.status === 'Active';
              const badge = isActive ? 'badge-success' : 'badge-neutral';
              
              return (
                <tr key={p.id}>
                  <td>
                    <Link href={`/students/${p.studentId}`} style={{ fontWeight: 600 }}>
                      {p.student.firstName} {p.student.lastName}
                    </Link>
                  </td>
                  <td style={{ fontWeight: 500 }}>{p.summary}</td>
                  <td>
                    <span className="badge badge-info">{p.riskArea}</span>
                  </td>
                  <td>{p.createdByUser.name}</td>
                  <td>{formatDate(p.followUpDate)}</td>
                  <td style={{ fontSize: '0.8rem', color: 'var(--color-text-muted)', maxWidth: '280px', whiteSpace: 'pre-line' }}>
                    {p.recommendedActions}
                  </td>
                  <td>
                    <span className={`badge ${badge}`}>{p.status}</span>
                  </td>
                  <td>
                    {isActive && canPerformAction(activeUser.role, 'intervention.complete') ? (
                      <form action={completePlanAction}>
                        <input type="hidden" name="planId" value={p.id} />
                        <button type="submit" className="btn btn-secondary btn-sm">
                          Close Case ✅
                        </button>
                      </form>
                    ) : (
                      <span style={{ fontSize: '0.75rem', color: 'var(--color-text-light)' }}>
                        {isActive ? '🔒 Read Only' : `Completed ${formatDate(p.updatedAt)}`}
                      </span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

    </div>
  );
}
