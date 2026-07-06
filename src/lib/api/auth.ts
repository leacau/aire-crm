'use client';

import type { User as FirebaseUser } from 'firebase/auth';
import { apiRequest } from '@/lib/api-client';
import type { AreaType, ScreenName, ScreenPermission, User } from '@/lib/types';

export type AuthSession = {
  user: User;
  permissions: Record<AreaType, Partial<Record<ScreenName, ScreenPermission>>>;
};

export function getAuthSession(user: FirebaseUser) {
  return apiRequest<AuthSession>('/api/auth/session', {
    method: 'POST',
    user,
  });
}

