import { NextResponse } from 'next/server';
import { dbAdmin } from '@/lib/firebase-admin';
import { isServerResponse, requireServerUser } from '@/lib/server/auth';
import { serializeDocument } from '@/lib/server/firestore';
import type { User, UserRole } from '@/lib/types';

export async function GET(request: Request) {
  const requester = await requireServerUser(request);
  if (isServerResponse(requester)) return requester;

  const { searchParams } = new URL(request.url);
  const role = searchParams.get('role') as UserRole | null;

  const snapshot = await dbAdmin.collection('users').get();
  let users = snapshot.docs.map(doc => serializeDocument<User>(doc.id, doc.data()));

  if (role) {
    users = users.filter(user => user.role === role);
  }

  users.sort((a, b) => (a.name || '').localeCompare(b.name || ''));

  return NextResponse.json({ users });
}

