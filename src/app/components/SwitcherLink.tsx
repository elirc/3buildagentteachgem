'use html';
'use client';

import React, { useTransition } from 'react';
import { switchUserAction } from '../actions';

interface SwitcherLinkProps {
  currentUserId: string;
  users: Array<{
    id: string;
    name: string;
    role: string;
  }>;
}

export default function SwitcherLink({ currentUserId, users }: SwitcherLinkProps) {
  const [isPending, startTransition] = useTransition();

  const handleChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const val = e.target.value;
    startTransition(async () => {
      await switchUserAction(val);
    });
  };

  return (
    <select
      value={currentUserId}
      onChange={handleChange}
      disabled={isPending}
      style={{
        fontSize: '0.75rem',
        padding: '2px 8px',
        borderRadius: '4px',
        border: '1px solid var(--color-border)',
        backgroundColor: '#ffffff',
        cursor: 'pointer',
        fontWeight: 600,
        color: 'var(--color-text-main)',
        outline: 'none',
        opacity: isPending ? 0.6 : 1,
      }}
    >
      {users.map((u) => (
        <option key={u.id} value={u.id}>
          {u.name} ({u.role})
        </option>
      ))}
    </select>
  );
}
