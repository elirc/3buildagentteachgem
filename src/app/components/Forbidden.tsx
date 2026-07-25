import React from 'react';
import Link from 'next/link';

/**
 * Shown when a session may not see a record.
 *
 * Note what it does NOT say: whether the record exists. The page that renders
 * this reaches it by asking for the record *within the caller's scope* and
 * getting nothing back — so it genuinely cannot distinguish "no such student"
 * from "not yours", and therefore cannot leak the difference. An error message
 * that says "this student exists but you may not see them" has already told an
 * attacker something.
 */
export default function Forbidden({
  role,
  what = 'this record',
}: {
  role: string;
  what?: string;
}) {
  return (
    <div className="card" style={{ textAlign: 'center', padding: '48px 32px' }}>
      <div style={{ fontSize: '2.5rem', marginBottom: '12px' }}>🔒</div>
      <h2 style={{ fontFamily: "'Outfit', sans-serif", fontSize: '1.4rem', margin: 0 }}>
        Not available
      </h2>
      <p style={{ color: 'var(--color-text-muted)', fontSize: '0.9rem', marginTop: '8px', lineHeight: 1.5 }}>
        Your active role (<strong>{role}</strong>) does not have access to {what}.
        <br />
        Switch roles in the header to view the school from another perspective.
      </p>
      <div style={{ marginTop: '20px', display: 'flex', gap: '8px', justifyContent: 'center' }}>
        <Link href="/" className="btn btn-secondary btn-sm">Back to dashboard</Link>
        <Link href="/permissions" className="btn btn-secondary btn-sm">See the permission matrix</Link>
      </div>
    </div>
  );
}
