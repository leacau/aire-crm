import { NextResponse } from 'next/server';
import { authAdmin, dbAdmin } from '@/lib/firebase-admin';
import { isServerResponse, requireServerManagement } from '@/lib/server/auth';
import { userErrorResponse } from '@/app/api/users/errors';

const DEFAULT_ROLE = 'Asesor';

export async function POST(request: Request) {
  const requester = await requireServerManagement(request);
  if (isServerResponse(requester)) return requester;

  try {
    let nextPageToken: string | undefined;
    let total = 0;
    let created = 0;
    let updated = 0;

    do {
      const page = await authAdmin.listUsers(1000, nextPageToken);
      total += page.users.length;

      for (let index = 0; index < page.users.length; index += 450) {
        const chunk = page.users.slice(index, index + 450);
        const refs = chunk.map(user => dbAdmin.collection('users').doc(user.uid));
        const existingDocs = await dbAdmin.getAll(...refs);
        const batch = dbAdmin.batch();

        existingDocs.forEach((snapshot, docIndex) => {
          const authUser = chunk[docIndex];
          const displayName = authUser.displayName || authUser.email?.split('@')[0] || 'Usuario';
          const baseProfile = {
            name: displayName,
            email: (authUser.email || '').toLowerCase(),
            photoURL: authUser.photoURL || null,
            updatedAt: new Date().toISOString(),
          };

          if (snapshot.exists) {
            batch.set(snapshot.ref, baseProfile, { merge: true });
            updated += 1;
          } else {
            batch.set(snapshot.ref, {
              ...baseProfile,
              role: DEFAULT_ROLE,
              createdAt: new Date().toISOString(),
            });
            created += 1;
          }
        });

        await batch.commit();
      }

      nextPageToken = page.pageToken;
    } while (nextPageToken);

    return NextResponse.json({ total, created, updated });
  } catch (error) {
    return userErrorResponse(error, {
      action: 'AUTH SYNC',
      requesterId: requester.uid,
      publicError: 'No se pudieron sincronizar los usuarios.',
    });
  }
}
