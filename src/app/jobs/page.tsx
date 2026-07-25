import React from 'react';
import { db } from '@/db';
import { getActiveUser } from '@/shared/auth';
import { formatDateTime } from '@/shared';
import { retryJobAction, requeueJobAction } from '../actions';
import { canRunJob } from '@/observability/jobs';
import { revalidatePath } from 'next/cache';
import Link from 'next/link';

export const revalidate = 0;

export default async function BackgroundJobsPage() {
  const activeUser = await getActiveUser();

  // Retry action wrapped
  async function handleRetry(formData: FormData) {
    'use server';
    const jobId = formData.get('jobId') as string;
    await retryJobAction(jobId);
  }

  async function handleRequeue(formData: FormData) {
    'use server';
    const jobId = formData.get('jobId') as string;
    await requeueJobAction(jobId);
  }

  // Fetch background jobs
  const jobs = await db.backgroundJob.findMany({
    orderBy: { createdAt: 'desc' },
  });

  // Queue depth by status. Derived in memory because the page has already loaded
  // every job — a groupBy query here would be a second round trip for data we hold.
  const depth = jobs.reduce<Record<string, number>>((acc, j) => {
    acc[j.status] = (acc[j.status] ?? 0) + 1;
    return acc;
  }, {});
  const deadLetteredCount = depth['DeadLettered'] ?? 0;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '32px' }}>
      
      <div>
        <h2 style={{ fontFamily: "'Outfit', sans-serif", fontSize: '1.8rem', fontWeight: 700, margin: 0 }}>
          Background Job Orchestrator
        </h2>
        <p style={{ margin: 0, color: 'var(--color-text-muted)', fontSize: '0.9rem' }}>
          Audit deferred jobs, examine execution error dumps, and trigger synchronous retry events on failed message queue payloads.
        </p>
      </div>

      {/* QUEUE DEPTH BY STATUS */}
      <div className="card" style={{ display: 'flex', gap: '24px', alignItems: 'center', padding: '16px 24px', flexWrap: 'wrap' }}>
        <span style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--color-text-muted)' }}>Queue depth:</span>
        {['Queued', 'Running', 'Succeeded', 'Failed', 'DeadLettered'].map((status) => (
          <div key={status} style={{ display: 'flex', alignItems: 'baseline', gap: '6px' }}>
            <strong style={{
              fontSize: '1.2rem',
              color: status === 'DeadLettered' && deadLetteredCount > 0 ? 'var(--color-danger)' : 'inherit',
            }}>
              {depth[status] ?? 0}
            </strong>
            <span style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)' }}>
              {status === 'DeadLettered' ? '☠️ Dead Letter' : status}
            </span>
          </div>
        ))}
      </div>

      {deadLetteredCount > 0 && (
        <div style={{
          padding: '12px 16px',
          backgroundColor: 'var(--color-risk-critical-bg)',
          border: '1px solid var(--color-danger)',
          borderRadius: 'var(--radius-sm)',
          fontSize: '0.85rem',
        }}>
          <strong>☠️ {deadLetteredCount} job{deadLetteredCount === 1 ? '' : 's'} exhausted the retry budget.</strong>{' '}
          Dead-lettered jobs cannot be retried directly — read the callstack, fix the cause, then
          <strong> Requeue</strong> to reset the attempt counter.
        </div>
      )}

      <div className="table-wrapper">
        <table className="data-table">
          <thead>
            <tr>
              <th>Job ID</th>
              <th>Task Type</th>
              <th>Status</th>
              <th>Attempts</th>
              <th>Created At</th>
              <th>Execution Details</th>
              <th>Roster Action</th>
            </tr>
          </thead>
          <tbody>
            {jobs.map((job) => {
              let badge = 'badge-neutral';
              if (job.status === 'Succeeded') badge = 'badge-success';
              else if (job.status === 'Failed') badge = 'badge-danger';
              else if (job.status === 'Running') badge = 'badge-info';
              else if (job.status === 'DeadLettered') badge = 'badge-danger';
              else if (job.status === 'Queued') badge = 'badge-warning';

              return (
                <tr key={job.id}>
                  <td>
                    <code>{job.id.substring(0, 8)}...</code>
                  </td>
                  <td>
                    <strong>{job.type}</strong>
                  </td>
                  <td>
                    <span className={`badge ${badge}`}>
                      {job.status === 'DeadLettered' ? '☠️ Dead Letter' : job.status}
                    </span>
                  </td>
                  <td>{job.attempts} / {job.maxAttempts}</td>
                  <td>{formatDateTime(job.createdAt)}</td>
                  <td style={{ fontSize: '0.75rem', maxWidth: '360px' }}>
                    <div style={{ fontWeight: 600 }}>Payload:</div>
                    <code style={{ fontSize: '0.7rem', display: 'block', backgroundColor: 'var(--color-bg)', padding: '4px', borderRadius: '4px', whiteSpace: 'pre-wrap', wordBreak: 'break-all' }}>
                      {job.payloadJSON}
                    </code>
                    {job.errorMessage && (
                      <div style={{ marginTop: '8px' }}>
                        <div style={{ fontWeight: 600, color: 'var(--color-danger-text)' }}>Callstack Error:</div>
                        <pre style={{
                          fontSize: '0.65rem',
                          color: 'var(--color-danger-text)',
                          backgroundColor: 'var(--color-risk-critical-bg)',
                          padding: '6px',
                          borderRadius: '4px',
                          whiteSpace: 'pre-wrap',
                          maxHeight: '120px',
                          overflowY: 'auto',
                          border: '1px solid var(--color-danger)'
                        }}>{job.errorMessage}</pre>
                      </div>
                    )}
                  </td>
                  <td>
                    {['Admin', 'SchoolManager'].includes(activeUser.role) ? (
                      job.status === 'DeadLettered' ? (
                        // A dead letter is a decision point, not a retry. Requeue resets
                        // the attempt budget but deliberately does not execute the job.
                        <form action={handleRequeue}>
                          <input type="hidden" name="jobId" value={job.id} />
                          <button type="submit" className="btn btn-danger btn-sm">
                            Requeue ♻️
                          </button>
                        </form>
                      ) : (
                        <form action={handleRetry}>
                          <input type="hidden" name="jobId" value={job.id} />
                          <button type="submit" className="btn btn-secondary btn-sm" disabled={!canRunJob(job.status)}>
                            Retry Now 🔄
                          </button>
                        </form>
                      )
                    ) : (
                      <span style={{ fontSize: '0.75rem', color: 'var(--color-text-light)' }}>🔒 Admin Only</span>
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
