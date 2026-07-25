import React from 'react';
import { db } from '@/db';
import { getActiveUser } from '@/shared/auth';
import { formatDateTime } from '@/shared';
import { markNotificationReadAction, markAllNotificationsReadAction } from '../actions';
import Link from 'next/link';

export const revalidate = 0;

const KIND_ICONS: Record<string, string> = {
  AgentRecommendation: '🤖',
  JobDeadLettered: '☠️',
  InterventionFollowUp: '🩹',
  System: 'ℹ️',
};

export default async function NotificationsPage({
  searchParams,
}: {
  searchParams: { filter?: string; kind?: string };
}) {
  const activeUser = await getActiveUser();

  const filter = searchParams.filter === 'unread' ? 'unread' : 'all';
  const kind = searchParams.kind;

  // Scoped to the active user by construction. Notifications are per-person by
  // design, so there is no version of this query without the userId — which is
  // the cheapest kind of access control there is.
  const where: any = { userId: activeUser.id };
  if (filter === 'unread') where.readAt = null;
  if (kind) where.kind = kind;

  const notifications = await db.notification.findMany({
    where,
    orderBy: [{ readAt: 'asc' }, { createdAt: 'desc' }],
    take: 50,
  });

  const unreadCount = await db.notification.count({
    where: { userId: activeUser.id, readAt: null },
  });

  async function handleMarkRead(formData: FormData) {
    'use server';
    await markNotificationReadAction(formData.get('notificationId') as string);
  }

  async function handleMarkAllRead() {
    'use server';
    await markAllNotificationsReadAction();
  }

  const kinds = ['AgentRecommendation', 'JobDeadLettered', 'InterventionFollowUp', 'System'];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div>
          <h2 style={{ fontFamily: "'Outfit', sans-serif", fontSize: '1.8rem', fontWeight: 700, margin: 0 }}>
            Notifications
          </h2>
          <p style={{ margin: 0, color: 'var(--color-text-muted)', fontSize: '0.9rem' }}>
            Signals routed to <strong>{activeUser.name}</strong> ({activeUser.role}).
            {unreadCount > 0 && <> <strong>{unreadCount} unread.</strong></>}
          </p>
        </div>

        {unreadCount > 0 && (
          <form action={handleMarkAllRead}>
            <button type="submit" className="btn btn-secondary btn-sm">Mark all read</button>
          </form>
        )}
      </div>

      <div className="card" style={{ display: 'flex', gap: '16px', alignItems: 'center', padding: '14px 20px', flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', gap: '4px' }}>
          {[
            { value: 'all', label: 'All' },
            { value: 'unread', label: `Unread (${unreadCount})` },
          ].map((f) => (
            <Link
              key={f.value}
              href={`/notifications?filter=${f.value}${kind ? `&kind=${kind}` : ''}`}
              className="btn btn-secondary btn-sm"
              style={{
                backgroundColor: filter === f.value ? 'var(--color-primary-light)' : '#ffffff',
                color: filter === f.value ? 'var(--color-primary)' : 'inherit',
              }}
            >
              {f.label}
            </Link>
          ))}
        </div>

        <div style={{ borderLeft: '1px solid var(--color-border)', height: '22px' }} />

        <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap' }}>
          <Link
            href={`/notifications?filter=${filter}`}
            className="btn btn-secondary btn-sm"
            style={{ backgroundColor: !kind ? 'var(--color-primary-light)' : '#ffffff' }}
          >
            All kinds
          </Link>
          {kinds.map((k) => (
            <Link
              key={k}
              href={`/notifications?filter=${filter}&kind=${k}`}
              className="btn btn-secondary btn-sm"
              style={{ backgroundColor: kind === k ? 'var(--color-primary-light)' : '#ffffff' }}
            >
              {KIND_ICONS[k]} {k.replace(/([A-Z])/g, ' $1').trim()}
            </Link>
          ))}
        </div>
      </div>

      {notifications.length === 0 ? (
        <div className="card" style={{ textAlign: 'center', padding: '40px', color: 'var(--color-text-muted)', fontSize: '0.9rem' }}>
          Nothing here. Notifications arrive when an agent produces a High or Critical
          recommendation you own, or when a background job exhausts its retries.
          <div style={{ fontSize: '0.8rem', marginTop: '8px' }}>
            Switch roles in the header — routing is per-person, so an Advisor and an Admin see
            different inboxes.
          </div>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          {notifications.map((n) => {
            const isUnread = !n.readAt;
            const urgent = n.urgency === 'Critical' || n.urgency === 'High';

            return (
              <div
                key={n.id}
                className="card"
                style={{
                  display: 'flex',
                  gap: '14px',
                  padding: '14px 18px',
                  borderLeft: `4px solid ${urgent ? 'var(--color-danger)' : 'var(--color-border)'}`,
                  backgroundColor: isUnread ? '#ffffff' : 'var(--color-bg)',
                  opacity: isUnread ? 1 : 0.75,
                }}
              >
                <span style={{ fontSize: '1.3rem' }}>{KIND_ICONS[n.kind] ?? 'ℹ️'}</span>

                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: '12px' }}>
                    <strong style={{ fontSize: '0.9rem', fontWeight: isUnread ? 700 : 500 }}>
                      {n.title}
                    </strong>
                    <span style={{ fontSize: '0.7rem', color: 'var(--color-text-muted)', whiteSpace: 'nowrap' }}>
                      {formatDateTime(n.createdAt)}
                    </span>
                  </div>

                  <p style={{ margin: '4px 0 0 0', fontSize: '0.85rem', lineHeight: 1.4 }}>{n.body}</p>

                  <div style={{ display: 'flex', gap: '12px', alignItems: 'center', marginTop: '8px' }}>
                    {n.linkPath && (
                      <Link href={n.linkPath} style={{ fontSize: '0.75rem', fontWeight: 600, textDecoration: 'underline' }}>
                        Open →
                      </Link>
                    )}
                    {isUnread && (
                      <form action={handleMarkRead}>
                        <input type="hidden" name="notificationId" value={n.id} />
                        <button
                          type="submit"
                          className="btn btn-secondary btn-sm"
                          style={{ fontSize: '0.7rem', padding: '2px 8px' }}
                        >
                          Mark read
                        </button>
                      </form>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
