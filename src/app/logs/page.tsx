import React from 'react';
import { db } from '@/db';
import { getActiveUser } from '@/shared/auth';
import { formatDateTime } from '@/shared';
import Link from 'next/link';

export const revalidate = 0;

export default async function LogExplorerPage({
  searchParams,
}: {
  searchParams: { level?: string; service?: string };
}) {
  const activeUser = await getActiveUser();

  const selectedLevel = searchParams.level || 'ALL';
  const selectedService = searchParams.service || 'ALL';

  // 1. Fetch distinct levels and services for filter dropdowns
  const distinctLogs = await db.systemLog.findMany({
    select: { level: true, service: true },
  });
  const levels = ['ALL', ...new Set(distinctLogs.map((l) => l.level))];
  const services = ['ALL', ...new Set(distinctLogs.map((l) => l.service))];

  // 2. Build where clause
  const whereClause: any = {};
  if (selectedLevel !== 'ALL') {
    whereClause.level = selectedLevel;
  }
  if (selectedService !== 'ALL') {
    whereClause.service = selectedService;
  }

  // 3. Query matching logs
  const logs = await db.systemLog.findMany({
    where: whereClause,
    orderBy: { createdAt: 'desc' },
    take: 50,
  });

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '32px' }}>
      
      <div>
        <h2 style={{ fontFamily: "'Outfit', sans-serif", fontSize: '1.8rem', fontWeight: 700, margin: 0 }}>
          Observability Log Explorer
        </h2>
        <p style={{ margin: 0, color: 'var(--color-text-muted)', fontSize: '0.9rem' }}>
          Audit unified structured log entries, investigate system fingerprint hashes, and review JSON transaction contexts.
        </p>
      </div>

      {/* FILTER BAR DROPDOWNS */}
      <div className="card" style={{ display: 'flex', gap: '16px', alignItems: 'center', padding: '16px 24px' }}>
        <span style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--color-text-muted)' }}>Filters:</span>
        
        {/* Filter by Level */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span style={{ fontSize: '0.8rem' }}>Severity Level</span>
          <div style={{ display: 'flex', gap: '4px' }}>
            {levels.map((lvl) => {
              const isSelected = lvl === selectedLevel;
              return (
                <Link
                  key={lvl}
                  href={`/logs?level=${lvl}&service=${selectedService}`}
                  className="btn btn-secondary btn-sm"
                  style={{
                    backgroundColor: isSelected ? 'var(--color-primary-light)' : '#ffffff',
                    color: isSelected ? 'var(--color-primary)' : 'inherit',
                    borderColor: isSelected ? 'var(--color-primary)' : 'var(--color-border)',
                  }}
                >
                  {lvl}
                </Link>
              );
            })}
          </div>
        </div>

        <div style={{ borderLeft: '1px solid var(--color-border)', height: '24px' }} />

        {/* Filter by Service */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span style={{ fontSize: '0.8rem' }}>Component Source</span>
          <div style={{ display: 'flex', gap: '4px' }}>
            {services.map((srv) => {
              const isSelected = srv === selectedService;
              return (
                <Link
                  key={srv}
                  href={`/logs?level=${selectedLevel}&service=${srv}`}
                  className="btn btn-secondary btn-sm"
                  style={{
                    backgroundColor: isSelected ? 'var(--color-primary-light)' : '#ffffff',
                    color: isSelected ? 'var(--color-primary)' : 'inherit',
                    borderColor: isSelected ? 'var(--color-primary)' : 'var(--color-border)',
                  }}
                >
                  {srv}
                </Link>
              );
            })}
          </div>
        </div>

      </div>

      {/* LOG DATA TABLE */}
      <div className="table-wrapper">
        <table className="data-table">
          <thead>
            <tr>
              <th>Timestamp</th>
              <th>Severity Level</th>
              <th>Component Source</th>
              <th>Log Message / Content</th>
              <th>Fingerprint Signature</th>
              <th>Trace Metadata</th>
            </tr>
          </thead>
          <tbody>
            {logs.map((log) => {
              let levelBadge = 'badge-neutral';
              if (log.level === 'error' || log.level === 'fatal') levelBadge = 'badge-danger';
              else if (log.level === 'warn') levelBadge = 'badge-warning';
              else if (log.level === 'info') levelBadge = 'badge-info';

              return (
                <tr key={log.id} style={{ fontFamily: 'monospace', fontSize: '0.8rem' }}>
                  <td style={{ whiteSpace: 'nowrap' }}>{formatDateTime(log.createdAt)}</td>
                  <td>
                    <span className={`badge ${levelBadge}`} style={{ fontSize: '0.65rem' }}>{log.level}</span>
                  </td>
                  <td><strong>{log.service}</strong></td>
                  <td style={{ color: 'var(--color-text-main)', maxWidth: '400px', wordBreak: 'break-all' }}>
                    {log.message}
                  </td>
                  <td style={{ fontSize: '0.7rem', color: 'var(--color-text-light)', maxWidth: '200px', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    <code>{log.fingerprint}</code>
                  </td>
                  <td style={{ maxWidth: '280px' }}>
                    {log.metadataJSON && log.metadataJSON !== '{}' ? (
                      <code style={{ fontSize: '0.65rem', display: 'block', backgroundColor: 'var(--color-bg)', padding: '4px', borderRadius: '4px', whiteSpace: 'pre-wrap', wordBreak: 'break-all' }}>
                        {log.metadataJSON}
                      </code>
                    ) : (
                      <span style={{ color: 'var(--color-text-light)' }}>—</span>
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
