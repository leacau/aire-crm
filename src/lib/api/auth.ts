'use client';

import { apiRequest } from '@/lib/api-client';
import type { AuthClientUser } from '@/lib/auth-client';
import type { AreaType, ScreenName, ScreenPermission, User } from '@/lib/types';

export type AuthSession = {
  user: User;
  permissions: Record<AreaType, Partial<Record<ScreenName, ScreenPermission>>>;
};

export function getAuthSession(user: AuthClientUser) {
  return apiRequest<AuthSession>('/api/auth/session', {
    method: 'POST',
    user,
  });
}
