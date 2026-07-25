import React from 'react';
import { db } from '@/db';
import { getActiveUser } from '@/shared/auth';
import { formatDateTime } from '@/shared';
import Link from 'next/link';

export const revalidate = 0;

const PAGE_SIZE = 25;

/** Severity list is a constant, not a query. See the note on filter options below. */
const LOG_LEVELS = ['debug', 'info', 'warn', 'error', 'fatal'];

const TIME_RANGES: Record<string, { label: string; ms: number | null }> = {
  '1h': { label: 'Last hour', ms: 60 * 60 * 1000 },
  '24h': { label: 'Last 24h', ms: 24 * 60 * 60 * 1000 },
  '7d': { label: 'Last 7 days', ms: 7 * 24 * 60 * 60 * 1000 },
  all: { label: 'All time', ms: null },
};

interface LogSearchParams {
  level?: string;
  service?: string;
  q?: string;
  range?: string;
  page?: string;
  fingerprint?: string;
}

export default async function LogExplorerPage({
  searchParams,
}: {
  searchParams: LogSearchParams;
}) {
  await getActiveUser();

  const selectedLevel = searchParams.level || 'ALL';
  const selectedService = searchParams.service || 'ALL';
  const selectedRange = searchParams.range && TIME_RANGES[searchParams.range] ? searchParams.range : 'all';
  const query = (searchParams.q || '').trim();
  const fingerprint = searchParams.fingerprint || '';

  /**
   * Builds a URL that changes one filter and preserves the rest.
   *
   * The previous version concatenated `?level=X&service=Y` by hand in two
   * places, which is why adding a third filter meant touching every link. Any
   * filter change also resets to page 1 — landing on page 7 of a result set
   * that now has two pages is a dead end.
   */
  function hrefWith(overrides: Partial<LogSearchParams>): string {
    const next: LogSearchParams = {
      level: selectedLevel,
      service: selectedService,
      range: selectedRange,
      q: query || undefined,
      fingerprint: fingerprint || undefined,
      ...overrides,
    };

    const params = new URLSearchParams();
    if (next.level && next.level !== 'ALL') params.set('level', next.level);
    if (next.service && next.service !== 'ALL') params.set('service', next.service);
    if (next.range && next.range !== 'all') params.set('range', next.range);
    if (next.q) params.set('q', next.q);
    if (next.fingerprint) params.set('fingerprint', next.fingerprint);
    if (next.page && next.page !== '1') params.set('page', next.page);

    const qs = params.toString();
    return qs ? `/logs?${qs}` : '/logs';
  }

  // ---- WHERE clause ------------------------------------------------------
  const whereClause: any = {};

  if (selectedLevel !== 'ALL') whereClause.level = selectedLevel;
  if (selectedService !== 'ALL') whereClause.service = selectedService;
  if (fingerprint) whereClause.fingerprint = fingerprint;

  if (query) {
    // NOTE: Prisma's `mode: 'insensitive'` is NOT supported on SQLite — passing
    // it throws at runtime. SQLite's LIKE is already case-insensitive for ASCII,
    // so plain `contains` is both correct and the only option here.
    whereClause.message = { contains: query };
  }

  const rangeMs = TIME_RANGES[selectedRange].ms;
  if (rangeMs !== null) {
    whereClause.createdAt = { gte: new Date(Date.now() - rangeMs) };
  }

  // ---- Pagination --------------------------------------------------------
  // Count first so the page number can be clamped before it reaches `skip`.
  // Number('abc') is NaN, and `skip: NaN` throws — a hand-edited URL should not
  // be able to 500 the page.
  const total = await db.systemLog.count({ where: whereClause });
  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE));

  const requestedPage = Number.parseInt(searchParams.page || '1', 10);
  const page = Number.isFinite(requestedPage) ? Math.min(Math.max(1, requestedPage), pageCount) : 1;

  const logs = await db.systemLog.findMany({
    where: whereClause,
    orderBy: { createdAt: 'desc' },
    skip: (page - 1) * PAGE_SIZE,
    take: PAGE_SIZE,
  });

  /**
   * Filter options.
   *
   * The old version ran `findMany({ select: { level, service } })` with no
   * `where` and no `take` — it loaded EVERY log row on every page view purely
   * to derive two dropdown lists, then queried again for 50 rows. On the
   * fastest-growing table in the database.
   *
   * Levels are a fixed union in the code, so they need no query at all.
   * Services need one, but `distinct` keeps it to the number of distinct
   * services rather than the number of rows.
   */
  const serviceRows = await db.systemLog.findMany({
    select: { service: true },
    distinct: ['service'],
    orderBy: { service: 'asc' },
  });
  const services = ['ALL', ...serviceRows.map((r) => r.service)];

  const hasActiveFilters =
    selectedLevel !== 'ALL' || selectedService !== 'ALL' || selectedRange !== 'all' || !!query || !!fingerprint;

  const firstRow = total === 0 ? 0 : (page - 1) * PAGE_SIZE + 1;
  const lastRow = Math.min(page * PAGE_SIZE, total);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>

      <div>
        <h2 style={{ fontFamily: "'Outfit', sans-serif", fontSize: '1.8rem', fontWeight: 700, margin: 0 }}>
          Observability Log Explorer
        </h2>
        <p style={{ margin: 0, color: 'var(--color-text-muted)', fontSize: '0.9rem' }}>
          Search structured log entries, group by fingerprint signature, and review JSON transaction contexts.
        </p>
      </div>

      {/* SEARCH — a plain GET form, so the page stays a Server Component and
          every search is a shareable, bookmarkable URL. */}
      <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: '16px', padding: '20px 24px' }}>
        <form method="get" action="/logs" style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
          <input
            type="search"
            name="q"
            defaultValue={query}
            placeholder="Search log messages…"
            className="form-control"
            style={{ flex: 1 }}
          />
          {/* Carry the other filters through the form submit, or searching would
              silently clear them. */}
          {selectedLevel !== 'ALL' && <input type="hidden" name="level" value={selectedLevel} />}
          {selectedService !== 'ALL' && <input type="hidden" name="service" value={selectedService} />}
          {selectedRange !== 'all' && <input type="hidden" name="range" value={selectedRange} />}
          <button type="submit" className="btn btn-primary btn-sm">Search</button>
          {hasActiveFilters && (
            <Link href="/logs" className="btn btn-secondary btn-sm">Clear filters</Link>
          )}
        </form>

        <div style={{ display: 'flex', gap: '20px', alignItems: 'center', flexWrap: 'wrap' }}>
          <FilterGroup
            label="Severity"
            options={['ALL', ...LOG_LEVELS]}
            selected={selectedLevel}
            hrefFor={(v) => hrefWith({ level: v, page: '1' })}
          />
          <div style={{ borderLeft: '1px solid var(--color-border)', height: '24px' }} />
          <FilterGroup
            label="Time"
            options={Object.keys(TIME_RANGES)}
            selected={selectedRange}
            labelFor={(v) => TIME_RANGES[v].label}
            hrefFor={(v) => hrefWith({ range: v, page: '1' })}
          />
        </div>

        <FilterGroup
          label="Service"
          options={services}
          selected={selectedService}
          hrefFor={(v) => hrefWith({ service: v, page: '1' })}
        />

        {fingerprint && (
          <div style={{
            padding: '8px 12px', backgroundColor: 'var(--color-primary-light)',
            borderRadius: 'var(--radius-sm)', fontSize: '0.8rem',
            display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          }}>
            <span>Grouped by fingerprint <code>{fingerprint}</code></span>
            <Link href={hrefWith({ fingerprint: undefined, page: '1' })} style={{ fontWeight: 600 }}>
              Remove ✕
            </Link>
          </div>
        )}
      </div>

      {/* RESULT COUNT + PAGER */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '0.85rem' }}>
        <span style={{ color: 'var(--color-text-muted)' }}>
          {total === 0 ? 'No matching log entries' : <>Showing <strong>{firstRow}–{lastRow}</strong> of <strong>{total}</strong></>}
        </span>

        <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
          {page > 1 ? (
            <Link href={hrefWith({ page: String(page - 1) })} className="btn btn-secondary btn-sm">← Previous</Link>
          ) : (
            <button className="btn btn-secondary btn-sm" disabled>← Previous</button>
          )}
          <span style={{ color: 'var(--color-text-muted)' }}>Page {page} of {pageCount}</span>
          {page < pageCount ? (
            <Link href={hrefWith({ page: String(page + 1) })} className="btn btn-secondary btn-sm">Next →</Link>
          ) : (
            <button className="btn btn-secondary btn-sm" disabled>Next →</button>
          )}
        </div>
      </div>

      {/* LOG TABLE */}
      <div className="table-wrapper">
        <table className="data-table">
          <thead>
            <tr>
              <th>Timestamp</th>
              <th>Severity</th>
              <th>Service</th>
              <th>Message</th>
              <th>Fingerprint</th>
              <th>Metadata</th>
            </tr>
          </thead>
          <tbody>
            {logs.length === 0 ? (
              <tr>
                <td colSpan={6} style={{ textAlign: 'center', padding: '32px', color: 'var(--color-text-muted)' }}>
                  Nothing matches these filters.
                </td>
              </tr>
            ) : logs.map((log) => {
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
                  <td style={{ color: 'var(--color-text-main)', maxWidth: '400px', wordBreak: 'break-word' }}>
                    {log.message}
                  </td>
                  <td style={{ fontSize: '0.7rem', maxWidth: '200px' }}>
                    {/* Clicking a fingerprint answers "how often does THIS happen?" —
                        the whole point of computing a stable signature. */}
                    <Link
                      href={hrefWith({ fingerprint: log.fingerprint, page: '1' })}
                      title="Show every log entry sharing this signature"
                      style={{ color: 'var(--color-text-light)', textDecoration: 'underline' }}
                    >
                      <code>{log.fingerprint.length > 40 ? log.fingerprint.slice(0, 40) + '…' : log.fingerprint}</code>
                    </Link>
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

function FilterGroup({
  label,
  options,
  selected,
  hrefFor,
  labelFor,
}: {
  label: string;
  options: string[];
  selected: string;
  hrefFor: (value: string) => string;
  labelFor?: (value: string) => string;
}) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
      <span style={{ fontSize: '0.8rem', color: 'var(--color-text-muted)' }}>{label}</span>
      <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap' }}>
        {options.map((value) => {
          const isSelected = value === selected;
          return (
            <Link
              key={value}
              href={hrefFor(value)}
              className="btn btn-secondary btn-sm"
              style={{
                backgroundColor: isSelected ? 'var(--color-primary-light)' : '#ffffff',
                color: isSelected ? 'var(--color-primary)' : 'inherit',
                borderColor: isSelected ? 'var(--color-primary)' : 'var(--color-border)',
              }}
            >
              {labelFor ? labelFor(value) : value}
            </Link>
          );
        })}
      </div>
    </div>
  );
}
