import React from 'react';
import { db } from '@/db';
import { getActiveUser } from '@/shared/auth';
import { formatDateTime } from '@/shared';
import Link from 'next/link';

export const revalidate = 0;

export default async function AgentRunsListPage() {
  const activeUser = await getActiveUser();

  // Fetch all runs
  const runs = await db.agentRun.findMany({
    orderBy: { createdAt: 'desc' },
  });

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '32px' }}>
      
      <div>
        <h2 style={{ fontFamily: "'Outfit', sans-serif", fontSize: '1.8rem', fontWeight: 700, margin: 0 }}>
          Agent Execution History
        </h2>
        <p style={{ margin: 0, color: 'var(--color-text-muted)', fontSize: '0.9rem' }}>
          Inspect academic operations mock agent outputs, review self-reported data limitations, and open full reasoning trace histories.
        </p>
      </div>

      <div className="table-wrapper">
        <table className="data-table">
          <thead>
            <tr>
              <th>Run ID</th>
              <th>Agent Category</th>
              <th>Target Model</th>
              <th>Target Identifier</th>
              <th>Status</th>
              <th>Confidence Level</th>
              <th>Executed At</th>
              <th>Action</th>
            </tr>
          </thead>
          <tbody>
            {runs.map((r) => {
              const badge = r.status === 'Succeeded' ? 'badge-success' : r.status === 'Failed' ? 'badge-danger' : 'badge-warning';
              
              return (
                <tr key={r.id}>
                  <td>
                    <code>{r.id.substring(0, 8)}...</code>
                  </td>
                  <td>
                    <strong>{r.agentType.replace(/([A-Z])/g, ' $1').trim()}</strong>
                  </td>
                  <td>
                    <span className="badge badge-neutral">{r.targetType}</span>
                  </td>
                  <td>
                    <code>{r.targetId.substring(0, 8)}...</code>
                  </td>
                  <td>
                    <span className={`badge ${badge}`}>{r.status}</span>
                  </td>
                  <td>
                    <strong>{r.confidenceScore ? Math.round(r.confidenceScore * 100) + '%' : '—'}</strong>
                  </td>
                  <td>{formatDateTime(r.createdAt)}</td>
                  <td>
                    <Link href={`/agent-runs/${r.id}`} className="btn btn-secondary btn-sm">
                      Inspect Chain-of-Thought
                    </Link>
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
