import { FieldPath, FieldValue } from 'firebase-admin/firestore';
import { authAdmin, dbAdmin } from '@/lib/firebase-admin';
import { hasServerManagementPrivileges, type ServerUser } from '@/lib/server/auth';
import { logServerActivity } from '@/lib/server/activity';
import { serializeDocument } from '@/lib/server/firestore';
import type { User, UserRole } from '@/lib/types';
import { getRequesterName } from '@/lib/server/requester';

const DEFAULT_ROLE: UserRole = 'Asesor';

export class UserApiError extends Error {
  constructor(
    message: string,
    public readonly status = 400,
  ) {
    super(message);
  }
}


export async function listUsersServer(role?: UserRole | null): Promise<User[]> {
  const snapshot = await dbAdmin.collection('users').get();
  let users = snapshot.docs.map(doc => serializeDocument<User>(doc.id, doc.data()));

  if (role) {
    users = users.filter(user => user.role === role);
  }

  return users.sort((a, b) => String(a.name || '').localeCompare(String(b.name || '')));
}

export async function createUserProfileServer(
  payload: Record<string, any>,
  requester: ServerUser,
): Promise<void> {
  const uid = String(payload?.uid || requester.uid);

  if (uid !== requester.uid && !hasServerManagementPrivileges(requester)) {
    throw new UserApiError('Forbidden', 403);
  }

  const name = String(payload?.name || requester.name || requester.email || 'Usuario').trim();
  const email = String(payload?.email || requester.email || '').trim().toLowerCase();

  if (!name || !email) {
    throw new UserApiError('Nombre y email son obligatorios.', 400);
  }

  await dbAdmin.collection('users').doc(uid).set({
    name,
    email,
    role: DEFAULT_ROLE,
    photoURL: payload?.photoURL || null,
    createdAt: FieldValue.serverTimestamp(),
  });
}

export async function getUserServer(userId: string): Promise<User | null> {
  const snap = await dbAdmin.collection('users').doc(userId).get();
  return snap.exists ? serializeDocument<User>(snap.id, snap.data()) : null;
}

export async function updateUserServer(
  userId: string,
  payload: Record<string, any>,
  requester: ServerUser,
): Promise<void> {
  if (requester.uid !== userId && !hasServerManagementPrivileges(requester)) {
    throw new UserApiError('Forbidden', 403);
  }

  const { id: _ignoredId, ...rawData } = payload || {};
  const data = Object.fromEntries(
    Object.entries(rawData).filter(([, value]) => value !== undefined),
  );

  await dbAdmin.collection('users').doc(userId).set(data, { merge: true });
}

export async function deleteUserServer(userId: string, requester: ServerUser): Promise<void> {
  if (!hasServerManagementPrivileges(requester)) {
    throw new UserApiError('Forbidden', 403);
  }

  const userRef = dbAdmin.collection('users').doc(userId);
  const userSnap = await userRef.get();
  if (!userSnap.exists) {
    throw new UserApiError('Usuario no encontrado.', 404);
  }

  const userData = serializeDocument<User>(userSnap.id, userSnap.data());
  const [clientsSnapshot, prospectsSnapshot] = await Promise.all([
    dbAdmin.collection('clients').where('ownerId', '==', userId).get(),
    dbAdmin.collection('prospects').where('ownerId', '==', userId).get(),
  ]);

  const refsToUpdate = [
    ...clientsSnapshot.docs.map(doc => doc.ref),
    ...prospectsSnapshot.docs.map(doc => doc.ref),
  ];

  for (let index = 0; index < refsToUpdate.length; index += 450) {
    const batch = dbAdmin.batch();
    refsToUpdate.slice(index, index + 450).forEach(ref => {
      batch.update(ref, {
        ownerId: FieldValue.delete(),
        ownerName: FieldValue.delete(),
      });
    });
    await batch.commit();
  }

  await userRef.delete();

  const requesterName = getRequesterName(requester);
  await logServerActivity({
    userId: requester.uid,
    userName: requesterName,
    type: 'delete',
    entityType: 'user',
    entityId: userId,
    entityName: userData.name,
    details: `elimino al usuario <strong>${userData.name}</strong> y desasigna ${clientsSnapshot.size} cliente(s) y ${prospectsSnapshot.size} prospecto(s).`,
    ownerName: requesterName,
  });
}

export async function setUserMonthlyClosureServer(
  userId: string,
  payload: Record<string, any>,
  requester: ServerUser,
): Promise<void> {
  const month = String(payload?.month || '').trim();
  const value = Number(payload?.value);

  if (!/^\d{4}-\d{2}$/.test(month)) {
    throw new UserApiError('El mes debe tener formato YYYY-MM.', 400);
  }

  if (!Number.isFinite(value)) {
    throw new UserApiError('El valor de cierre debe ser numerico.', 400);
  }

  const userRef = dbAdmin.collection('users').doc(userId);
  const advisorSnap = await userRef.get();
  if (!advisorSnap.exists) {
    throw new UserApiError('Asesor no encontrado.', 404);
  }

  const advisorName = String(advisorSnap.data()?.name || 'Asesor');
  await userRef.update(new FieldPath('monthlyClosures', month), value);

  await logServerActivity({
    userId: requester.uid,
    userName: getRequesterName(requester),
    type: 'update',
    entityType: 'monthly_closure',
    entityId: userId,
    entityName: advisorName,
    details: `registro el cierre de <strong>${month}</strong> para <strong>${advisorName}</strong> con un valor de <strong>$${value.toLocaleString('es-AR')}</strong>`,
    ownerName: advisorName,
  });
}

export async function createExternalUserServer(
  payload: Record<string, any>,
  requester: ServerUser,
): Promise<{ id: string; email: string; name: string }> {
  const email = String(payload.email || '').trim().toLowerCase();
  const password = String(payload.password || '');
  const name = String(payload.name || '').trim();

  if (!email || !email.includes('@') || !name || password.length < 8) {
    throw new UserApiError('Nombre, correo valido y contrasena de al menos 8 caracteres son obligatorios.', 400);
  }

  try {
    const authUser = await authAdmin.createUser({
      email,
      password,
      displayName: name,
      emailVerified: true,
      disabled: false,
    });

    await dbAdmin.collection('users').doc(authUser.uid).set({
      name,
      email,
      role: 'Asesor Canjes',
      area: 'Canjes',
      externalUser: true,
      createdAt: new Date().toISOString(),
      createdBy: requester.uid,
    });

    return { id: authUser.uid, email, name };
  } catch (error: any) {
    if (error?.code === 'auth/email-already-exists') {
      throw new UserApiError('Ya existe una cuenta con ese correo.', 400);
    }
    throw new UserApiError('No se pudo crear la cuenta externa.', 400);
  }
}

export async function syncAuthUsersServer(): Promise<{
  total: number;
  created: number;
  updated: number;
}> {
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

  return { total, created, updated };
}