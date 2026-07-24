import type { ServerUser } from '@/lib/server/auth';

export function getRequesterName(requester: ServerUser): string {
  return requester.name || requester.email || 'Usuario';
}
