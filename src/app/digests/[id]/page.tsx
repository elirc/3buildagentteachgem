import React from 'react';
import { db } from '@/db';
import { getActiveUser } from '@/shared/auth';
import { formatDate, formatDateTime, canPerformAction } from '@/shared';
import { buildStudentScope } from '@/shared/scope';
import { approveDigestAction } from '../../actions';
import Forbidden from '../../components/Forbidden';
import Link from 'next/link';

export const revalidate = 0;

export default async function DigestPreviewPage({ params }: { params: { id: string } }) {
  const activeUser = await getActiveUser();

  // findFirst with the student scope folded in — same pattern as the student
  // profile, for the same reason: an unauthorised id must be indistinguishable
  // from a nonexistent one.
  const digest = await db.guardianDigest.findFirst({
    where: { id: params.id, student: buildStudentScope(activeUser) },
    include: { student: true },
  });

  if (!digest) {
    return <Forbidden role={activeUser.role} what="this guardian digest" />;
  }

  async function handleApprove() {
    'use server';
    await approveDigestAction(params.id);
  }

  let metrics: any = {};
  try {
    metrics = JSON.parse(digest.metricsJSON);
  } catch {
    metrics = {};
  }

  const canApprove = canPerformAction(activeUser.role, 'intervention.complete');

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
      <div>
        <div style={{ display: 'flex', gap: '8px', fontSize: '0.8rem', color: 'var(--color-text-muted)', marginBottom: '4px' }}>
          <Link href="/digests">Guardian Digests</Link>
          <span>/</span>
          <span style={{ color: 'var(--color-text-main)' }}>
            {digest.student.firstName} {digest.student.lastName}
          </span>
        </div>
        <h2 style={{ fontFamily: "'Outfit', sans-serif", fontSize: '1.8rem', fontWeight: 700, margin: 0 }}>
          Digest Preview
        </h2>
        <p style={{ margin: 0, color: 'var(--color-text-muted)', fontSize: '0.9rem' }}>
          Week of {formatDate(digest.periodStart)} — {formatDate(digest.periodEnd)}
        </p>
      </div>

      <div style={{ display: 'flex', gap: '24px', alignItems: 'flex-start' }}>
        {/* The rendered message, styled as an inbox preview so a reviewer reads
            it the way a parent will rather than as a database field. */}
        <div style={{ flex: 2 }}>
          <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
            <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--color-border)', backgroundColor: 'var(--color-bg)' }}>
              <div style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)' }}>
                To: <strong>{digest.student.guardianName}</strong>{' '}
                &lt;{digest.student.guardianEmail || 'no address on file'}&gt;
              </div>
              <div style={{ fontSize: '1rem', fontWeight: 700, marginTop: '6px' }}>{digest.subject}</div>
            </div>

            <pre style={{
              margin: 0,
              padding: '20px',
              fontFamily: "'Inter', sans-serif",
              fontSize: '0.85rem',
              lineHeight: 1.6,
              whiteSpace: 'pre-wrap',
              wordBreak: 'break-word',
              backgroundColor: '#ffffff',
            }}>
              {digest.bodyText}
            </pre>
          </div>
        </div>

        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '16px' }}>
          <div className="card">
            <h3 style={{ fontSize: '1rem', marginBottom: '12px' }}>Status</h3>
            <div style={{ marginBottom: '12px' }}>
              <span className={`badge ${digest.status === 'Sent' ? 'badge-success' : 'badge-warning'}`}>
                {digest.status}
              </span>
              {digest.sentAt && (
                <div style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)', marginTop: '4px' }}>
                  Approved {formatDateTime(digest.sentAt)}
                </div>
              )}
            </div>

            {digest.status === 'Draft' && canApprove && (
              <form action={handleApprove}>
                <button type="submit" className="btn btn-primary btn-sm" style={{ width: '100%' }}>
                  Approve &amp; mark sent
                </button>
              </form>
            )}

            {!digest.student.guardianEmail && (
              <div style={{
                marginTop: '12px', padding: '8px 10px', fontSize: '0.75rem',
                backgroundColor: 'var(--color-risk-critical-bg)',
                border: '1px solid var(--color-danger)', borderRadius: 'var(--radius-sm)',
              }}>
                ⚠️ Undeliverable: no guardian email on file. The digest was still generated so the
                gap is visible rather than silent.
              </div>
            )}
          </div>

          <div className="card">
            <h3 style={{ fontSize: '1rem', marginBottom: '12px' }}>Numbers behind the prose</h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', fontSize: '0.8rem' }}>
              {Object.entries(metrics).map(([k, v]) => (
                <div key={k} style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ color: 'var(--color-text-muted)' }}>{k}</span>
                  <strong>{String(v)}</strong>
                </div>
              ))}
            </div>
            <p style={{ fontSize: '0.7rem', color: 'var(--color-text-muted)', marginTop: '12px', marginBottom: 0 }}>
              Stored alongside the text so a reviewer can check the wording against the data that
              produced it, without re-running the job.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
