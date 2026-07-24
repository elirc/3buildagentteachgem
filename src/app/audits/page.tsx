import React from 'react';
import { db } from '@/db';
import { getActiveUser } from '@/shared/auth';
import { formatDateTime } from '@/shared';

export const revalidate = 0;

export default async function AuditsListPage() {
  const activeUser = await getActiveUser();

  // Fetch audit events
  const audits = await db.auditEvent.findMany({
    orderBy: { createdAt: 'desc' },
  });

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '32px' }}>
      
      <div>
        <h2 style={{ fontFamily: "'Outfit', sans-serif", fontSize: '1.8rem', fontWeight: 700, margin: 0 }}>
          Transaction Audit logs
        </h2>
        <p style={{ margin: 0, color: 'var(--color-text-muted)', fontSize: '0.9rem' }}>
          Inspect absolute system mutations, compare database record before/after diff configurations, and verify compliance chains.
        </p>
      </div>

      <div className="table-wrapper">
        <table className="data-table">
          <thead>
            <tr>
              <th>Timestamp</th>
              <th>Action Code</th>
              <th>Target Model</th>
              <th>Affected ID</th>
              <th>Responsible Actor</th>
              <th>Database State Diffs</th>
            </tr>
          </thead>
          <tbody>
            {audits.map((a) => (
              <tr key={a.id}>
                <td style={{ fontFamily: 'monospace', fontSize: '0.75rem', whiteSpace: 'nowrap' }}>
                  {formatDateTime(a.createdAt)}
                </td>
                <td>
                  <span className="badge badge-neutral" style={{ fontFamily: 'monospace', fontSize: '0.7rem' }}>
                    {a.action}
                  </span>
                </td>
                <td><strong>{a.entityType}</strong></td>
                <td>
                  <code>{a.entityId.substring(0, 8)}...</code>
                </td>
                <td>
                  <span style={{ fontSize: '0.8rem', fontWeight: 600 }}>
                    {a.actorId === 'system' ? '💻 System Engine' : `User ID: ${a.actorId.substring(0, 8)}`}
                  </span>
                </td>
                <td style={{ maxWidth: '400px' }}>
                  <details style={{
                    cursor: 'pointer',
                    fontSize: '0.75rem',
                    backgroundColor: 'var(--color-bg)',
                    padding: '8px',
                    borderRadius: 'var(--radius-sm)',
                    border: '1px solid var(--color-border)'
                  }}>
                    <summary style={{ fontWeight: 600, color: 'var(--color-primary)' }}>
                      Click to expand Before / After JSON Diff
                    </summary>
                    
                    <div style={{ display: 'flex', gap: '10px', marginTop: '8px', overflowX: 'auto', padding: '4px' }}>
                      {/* Before state */}
                      <div style={{ flex: 1, minWidth: '180px' }}>
                        <span style={{ fontWeight: 600, color: 'var(--color-text-muted)', display: 'block', fontSize: '0.65rem', marginBottom: '2px' }}>
                          BEFORE STATE
                        </span>
                        <pre style={{
                          backgroundColor: '#ffffff',
                          padding: '6px',
                          borderRadius: '4px',
                          border: '1px solid var(--color-border-light)',
                          fontFamily: 'monospace',
                          fontSize: '0.65rem',
                          margin: 0
                        }}>{a.beforeJSON ? JSON.stringify(JSON.parse(a.beforeJSON), null, 2) : 'NULL (Created new record)'}</pre>
                      </div>

                      {/* After state */}
                      <div style={{ flex: 1, minWidth: '180px' }}>
                        <span style={{ fontWeight: 600, color: 'var(--color-text-muted)', display: 'block', fontSize: '0.65rem', marginBottom: '2px' }}>
                          AFTER STATE
                        </span>
                        <pre style={{
                          backgroundColor: '#ffffff',
                          padding: '6px',
                          borderRadius: '4px',
                          border: '1px solid var(--color-border-light)',
                          fontFamily: 'monospace',
                          fontSize: '0.65rem',
                          margin: 0
                        }}>{a.afterJSON ? JSON.stringify(JSON.parse(a.afterJSON), null, 2) : 'NULL (Deleted record)'}</pre>
                      </div>
                    </div>

                    {a.metadataJSON && (
                      <div style={{ marginTop: '8px', borderTop: '1px solid var(--color-border-light)', paddingTop: '6px' }}>
                        <span style={{ fontWeight: 600, color: 'var(--color-text-muted)', display: 'block', fontSize: '0.65rem' }}>
                          METADATA
                        </span>
                        <pre style={{
                          backgroundColor: '#ffffff',
                          padding: '4px',
                          fontFamily: 'monospace',
                          fontSize: '0.65rem',
                          margin: 0
                        }}>{JSON.stringify(JSON.parse(a.metadataJSON), null, 2)}</pre>
                      </div>
                    )}
                  </details>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

    </div>
  );
}
