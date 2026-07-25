import React from 'react';
import '@/styles/global.css';
import { getActiveUser } from '@/shared/auth';
import { db } from '@/db';
import SwitcherLink from './components/SwitcherLink';
import Link from 'next/link';

export const metadata = {
  title: 'EduOps Portal - Agentic Education Operations & LMS',
  description: 'Enterprise modular monolith learning laboratory and educational operations cockpit.',
};

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // Fetch the active mock session and all user options from the DB for our Developer Switcher dropdown
  const activeUser = await getActiveUser();
  const allUsers = await db.user.findMany({
    orderBy: { name: 'asc' },
  });

  return (
    <html lang="en">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=Outfit:wght@500;700&display=swap" rel="stylesheet" />
      </head>
      <body style={{ display: 'flex', flexDirection: 'column', minHeight: '100vh' }}>
        
        {/* TOP COCKPIT HEADER */}
        <header style={{
          backgroundColor: '#ffffff',
          borderBottom: '1px solid var(--color-border-light)',
          padding: '12px 24px',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          position: 'sticky',
          top: 0,
          zIndex: 100,
          boxShadow: '0 2px 8px rgba(0, 0, 0, 0.02)'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <span style={{ fontSize: '1.4rem' }}>🎓</span>
            <div>
              <h1 style={{
                fontFamily: "'Outfit', sans-serif",
                fontSize: '1.2rem',
                margin: 0,
                color: 'var(--color-primary)',
                fontWeight: 700
              }}>EduOps Platform</h1>
              <span style={{ fontSize: '0.7rem', color: 'var(--color-text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                Modular Monolith SWE Laboratory
              </span>
            </div>
          </div>

          {/* DEVELOPER SWITCHER CONTROL */}
          <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: '12px',
            backgroundColor: 'var(--color-bg)',
            padding: '6px 12px',
            borderRadius: 'var(--radius-sm)',
            border: '1px solid var(--color-border)'
          }}>
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end' }}>
              <span style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--color-text-main)' }}>
                {activeUser.name}
              </span>
              <span style={{
                fontSize: '0.65rem',
                backgroundColor: 'var(--color-primary-light)',
                color: 'var(--color-primary)',
                padding: '1px 6px',
                borderRadius: '9999px',
                fontWeight: 700,
                textTransform: 'uppercase'
              }}>
                {activeUser.role}
              </span>
            </div>
            
            {/* Interactive Switcher using Client Subcomponent */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
              <span style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)' }}>Act As:</span>
              <SwitcherLink currentUserId={activeUser.id} users={allUsers.map(u => ({ id: u.id, name: u.name, role: u.role }))} />
            </div>
          </div>
        </header>

        {/* WORKSPACE SIDEBAR + PAGE SHELL */}
        <div style={{ display: 'flex', flex: 1 }}>
          
          {/* SIDEBAR NAVIGATION */}
          <aside style={{
            width: '240px',
            backgroundColor: '#ffffff',
            borderRight: '1px solid var(--color-border-light)',
            padding: '24px 16px',
            display: 'flex',
            flexDirection: 'column',
            gap: '32px'
          }}>
            
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              <span style={{ fontSize: '0.7rem', textTransform: 'uppercase', color: 'var(--color-text-light)', fontWeight: 700, letterSpacing: '0.05em', paddingLeft: '8px' }}>
                Academic Operations
              </span>
              
              <nav style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                <Link href="/" className="sidebar-link">📊 Dashboard</Link>
                <Link href="/teachers" className="sidebar-link">👨‍🏫 Teacher Management</Link>
                <Link href="/students" className="sidebar-link">👨‍Grad Students</Link>
                <Link href="/courses" className="sidebar-link">📚 Course Catalog</Link>
                <Link href="/sections" className="sidebar-link">🏫 Class Sections</Link>
                <Link href="/interventions" className="sidebar-link">🩹 Support & Interventions</Link>
                <Link href="/digests" className="sidebar-link">✉️ Guardian Digests</Link>
              </nav>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              <span style={{ fontSize: '0.7rem', textTransform: 'uppercase', color: 'var(--color-text-light)', fontWeight: 700, letterSpacing: '0.05em', paddingLeft: '8px' }}>
                Observability Cockpit
              </span>
              
              <nav style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                <Link href="/jobs" className="sidebar-link">⚙️ Background Jobs</Link>
                <Link href="/logs" className="sidebar-link">📝 Log Explorer</Link>
                <Link href="/agent-runs" className="sidebar-link">🤖 Agent Reasoning Runs</Link>
                <Link href="/audits" className="sidebar-link">🔐 Audit History</Link>
                <Link href="/permissions" className="sidebar-link">🛡️ Permission Matrix</Link>
              </nav>
            </div>

            <div style={{
              marginTop: 'auto',
              padding: '12px',
              backgroundColor: 'var(--color-primary-light)',
              borderRadius: 'var(--radius-sm)',
              border: '1px dashed var(--color-primary)'
            }}>
              <span style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--color-primary)', display: 'block', marginBottom: '4px' }}>
                Mentor Tip 💡
              </span>
              <p style={{ fontSize: '0.7rem', color: 'var(--color-text-main)', margin: 0, lineHeight: 1.4 }}>
                Switch active users in the header to instantly trigger different RBAC permissions on pages.
              </p>
            </div>
          </aside>

          {/* PAGE CONTENT CONTAINER */}
          <main style={{ flex: 1, padding: '32px 40px', overflowY: 'auto', maxWidth: 'calc(100% - 240px)' }}>
            {children}
          </main>
        </div>

        {/* Global Sidebar Overrides styling injection */}
        <style dangerouslySetInnerHTML={{ __html: `
          .sidebar-link {
            display: flex;
            align-items: center;
            padding: 8px 12px;
            font-size: 0.85rem;
            font-weight: 500;
            color: var(--color-text-muted);
            border-radius: var(--radius-sm);
            transition: all var(--transition-fast);
          }
          .sidebar-link:hover {
            color: var(--color-primary);
            background-color: var(--color-primary-light);
            text-decoration: none;
          }
        ` }} />

      </body>
    </html>
  );
}
