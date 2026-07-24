import { cookies } from 'next/headers';
import { db } from '@/db';
import { UserRole } from './index';

export interface ActiveSession {
  id: string;
  username: string;
  name: string;
  email: string;
  role: UserRole;
  profileId?: string; // Student or Teacher profile ID if applicable
}

/**
 * Server-side helper to fetch the active logged-in user from the cookies.
 * Defaults to the 'admin' user if no cookie is set to ensure instant out-of-the-box loading.
 */
export async function getActiveUser(): Promise<ActiveSession> {
  const cookieStore = cookies();
  let userId = cookieStore.get('mock_user_id')?.value;

  let dbUser = null;

  if (userId) {
    dbUser = await db.user.findUnique({
      where: { id: userId },
      include: { student: true, teacher: true },
    });
  }

  // Fallback if no user or deleted
  if (!dbUser) {
    dbUser = await db.user.findFirst({
      where: { username: 'admin' },
      include: { student: true, teacher: true },
    });
  }

  if (!dbUser) {
    throw new Error('❌ Critical Setup Error: No admin user found in database. Did you run the seed script?');
  }

  return {
    id: dbUser.id,
    username: dbUser.username,
    name: dbUser.name,
    email: dbUser.email,
    role: dbUser.role as UserRole,
    profileId: dbUser.student?.id || dbUser.teacher?.id || undefined,
  };
}

/**
 * Server action / helper to update the active user cookie.
 */
export async function setActiveUserCookie(userId: string): Promise<void> {
  const cookieStore = cookies();
  cookieStore.set('mock_user_id', userId, { path: '/' });
}
