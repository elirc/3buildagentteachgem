import React from 'react';
import { db } from '@/db';
import { getActiveUser } from '@/shared/auth';
import { formatDate, formatDateTime, canPerformAction } from '@/shared';
import { buildStudentScope } from '@/shared/scope';
import { generateDigestsAction } from '../actions';
import Link from 'next/link';

export const revalidate = 0;

export default async function DigestsPage() {
  const activeUser = await getActiveUser();

  async function handleGenerate() {
    'use server';
    await generateDigestsAction();
  }

  // Scoped like every other student surface: a digest is student data.
  const digests = await db.guardianDigest.findMany({
    where: { student: buildStudentScope(activeUser) },
    include: { student: true },
    orderBy: [{ periodStart: 'desc' }, { createdAt: 'desc' }],
    take: 50,
  });

  const drafts = digests.filter((d) => d.status === 'Draft').length;
  const canGenerate = canPerformAction(activeUser.role, 'job.process');

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div>
          <h2 style={{ fontFamily: "'Outfit', sans-serif", fontSize: '1.8rem', fontWeight: 700, margin: 0 }}>
            Guardian Digests
          </h2>
          <p style={{ margin: 0, color: 'var(--color-text-muted)', fontSize: '0.9rem' }}>
            Weekly family summaries, composed from live data and held for review before sending.
          </p>
        </div>

        {canGenerate && (
          <form action={handleGenerate}>
            <button type="submit" className="btn btn-primary btn-sm">
              ✉️ Queue digests for all active students
            </button>
          </form>
        )}
      </div>

      <div className="card" style={{ fontSize: '0.85rem', lineHeight: 1.6 }}>
        <strong>Nothing here is emailed.</strong> This app has no mail transport, and pretending
        otherwise would be worse than saying so. Generating writes a <code>Draft</code>; approving
        records that a human read it and judged it fit to send. That decision is the part worth
        modelling — the SMTP call is the easy bit.
        <br />
        <br />
        Digests include <strong>only</strong> support notes with <code>Shared</code> visibility.
        That filter is an allowlist, so a new visibility level added later is invisible to families
        by default rather than visible because nobody remembered to exclude it.
        {drafts > 0 && (
          <>
            <br />
            <br />
            <strong>{drafts}</strong> draft{drafts === 1 ? '' : 's'} awaiting review.
          </>
        )}
      </div>

      {digests.length === 0 ? (
        <div className="card" style={{ textAlign: 'center', padding: '40px', color: 'var(--color-text-muted)', fontSize: '0.9rem' }}>
          No digests yet. Queue them above, then drain the queue on{' '}
          <Link href="/jobs">the jobs page</Link> — composition happens in a background job.
        </div>
      ) : (
        <div className="table-wrapper">
          <table className="data-table">
            <thead>
              <tr>
                <th>Student</th>
                <th>Week</th>
                <th>Subject</th>
                <th>Highlights</th>
                <th>Status</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {digests.map((d) => {
                let metrics: any = {};
                try {
                  metrics = JSON.parse(d.metricsJSON);
                } catch {
                  metrics = {};
                }

                return (
                  <tr key={d.id}>
                    <td>
                      <Link href={`/students/${d.studentId}`} style={{ fontWeight: 600 }}>
                        {d.student.firstName} {d.student.lastName}
                      </Link>
                      <div style={{ fontSize: '0.7rem', color: 'var(--color-text-muted)' }}>
                        {d.student.guardianEmail || (
                          <span style={{ color: 'var(--color-danger-text)' }}>no guardian email</span>
                        )}
                      </div>
                    </td>
                    <td style={{ whiteSpace: 'nowrap' }}>{formatDate(d.periodStart)}</td>
                    <td style={{ fontSize: '0.85rem' }}>{d.subject}</td>
                    <td style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)' }}>
                      {metrics.isQuietWeek ? (
                        <span>Quiet week</span>
                      ) : (
                        <>
                          {metrics.newGradeCount > 0 && <span>{metrics.newGradeCount} new grades · </span>}
                          {metrics.missingCount > 0 && (
                            <span style={{ color: 'var(--color-danger-text)' }}>{metrics.missingCount} missing · </span>
                          )}
                          {metrics.absences > 0 && <span>{metrics.absences} absences</span>}
                        </>
                      )}
                    </td>
                    <td>
                      <span className={`badge ${d.status === 'Sent' ? 'badge-success' : 'badge-warning'}`}>
                        {d.status}
                      </span>
                      {d.sentAt && (
                        <div style={{ fontSize: '0.65rem', color: 'var(--color-text-muted)' }}>
                          {formatDateTime(d.sentAt)}
                        </div>
                      )}
                    </td>
                    <td>
                      <Link href={`/digests/${d.id}`} className="btn btn-secondary btn-sm">Preview</Link>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
