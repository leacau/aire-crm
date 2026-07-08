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

export async function createUserProfile(
  uid: string,
  name: string,
  email: string,
  photoURL?: string,
): Promise<void> {
  await apiRequest<{ ok: true }>('/api/users', {
    method: 'POST',
    body: { uid, name, email, photoURL },
  });
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

export async function saveMonthlyClosure(userId: string, month: string, value: number): Promise<void> {
  await apiRequest<{ ok: true }>(`/api/users/${encodeURIComponent(userId)}/monthly-closure`, {
    method: 'PUT',
    body: { month, value },
  });
}

export async function syncRegisteredUsersFromAuth(): Promise<{ total: number; created: number; updated: number }> {
  return apiRequest<{ total: number; created: number; updated: number }>('/api/admin/users/sync', {
    method: 'POST',
  });
}

export async function createExternalCanjeUser(data: {
  name: string;
  email: string;
  password: string;
}): Promise<{ id: string; email: string; name: string }> {
  return apiRequest<{ id: string; email: string; name: string }>('/api/admin/users/external', {
    method: 'POST',
    body: data,
  });
}

export async function deleteUserAndReassignEntities(userId: string): Promise<void> {
  await apiRequest<{ ok: true }>(`/api/users/${encodeURIComponent(userId)}`, {
    method: 'DELETE',
  });
}
