'use client';

import { apiRequest } from '@/lib/api-client';
import type { User, UserRole } from '@/lib/types';

export async function getAllUsers(role?: UserRole): Promise<User[]> {
  const search = role ? `?role=${encodeURIComponent(role)}` : '';
  const result = await apiRequest<{ users: User[] }>(`/api/users${search}`, { method: 'GET' });
  return result.users;
}

export async function getUserById(userId: string): Promise<User | null> {
  const result = await apiRequest<{ user: User | null }>(`/api/users/${encodeURIComponent(userId)}`, {
    method: 'GET',
  });
  return result.user;
}

export function getUserProfile(uid: string): Promise<User | null> {
  return getUserById(uid);
}

export async function updateUserProfile(uid: string, data: Partial<User>): Promise<void> {
  await apiRequest<{ ok: true }>(`/api/users/${encodeURIComponent(uid)}`, {
    method: 'PATCH',
    body: data,
  });
}

