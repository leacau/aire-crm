import { dbAdmin } from '@/lib/firebase-admin';
import { hasServerManagementPrivileges, type ServerUser } from '@/lib/server/auth';
import type { CommercialNote } from '@/lib/types';

export function canReviewCommercialNotes(user: ServerUser): boolean {
  return hasServerManagementPrivileges(user) || user.area === 'Pautado';
}

export async function getOwnedClientIds(userId: string): Promise<Set<string>> {
  const snapshot = await dbAdmin.collection('clients').where('ownerId', '==', userId).get();
  return new Set(snapshot.docs.map(doc => doc.id));
}

export async function canAccessCommercialNote(note: CommercialNote, requester: ServerUser): Promise<boolean> {
  if (canReviewCommercialNotes(requester)) return true;
  if (note.advisorId === requester.uid) return true;
  if (!note.clientId) return false;

  const clientSnap = await dbAdmin.collection('clients').doc(note.clientId).get();
  return clientSnap.exists && clientSnap.data()?.ownerId === requester.uid;
}

export async function filterAccessibleCommercialNotes(
  notes: CommercialNote[],
  requester: ServerUser,
): Promise<CommercialNote[]> {
  if (canReviewCommercialNotes(requester)) return notes;

  const ownedClientIds = await getOwnedClientIds(requester.uid);
  return notes.filter(note => note.advisorId === requester.uid || ownedClientIds.has(note.clientId));
}

export function canAssignCommercialNoteAdvisor(requester: ServerUser): boolean {
  return hasServerManagementPrivileges(requester);
}
