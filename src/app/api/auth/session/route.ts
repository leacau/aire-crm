import { NextResponse } from 'next/server';
import { FieldValue } from 'firebase-admin/firestore';
import { authAdmin, dbAdmin } from '@/lib/firebase-admin';
import { getBearerToken } from '@/lib/server/auth';
import { defaultPermissions } from '@/lib/data';
import { serializeFirestoreValue } from '@/lib/server/firestore';

const AREA_PERMISSIONS_DOC_ID = 'area_permissions';
const EMAIL_WHITELIST_DOC_ID = 'email_whitelist';

async function getPermissions() {
  const docRef = dbAdmin.collection('system_config').doc(AREA_PERMISSIONS_DOC_ID);
  const snap = await docRef.get();

  if (snap.exists) {
    return snap.data()?.permissions || defaultPermissions;
  }

  await docRef.set({ permissions: defaultPermissions });
  return defaultPermissions;
}

async function getEmailWhitelist(): Promise<string[]> {
  const snap = await dbAdmin.collection('system_config').doc(EMAIL_WHITELIST_DOC_ID).get();
  const emails = snap.exists ? snap.data()?.emails : [];
  return Array.isArray(emails) ? emails : [];
}

export async function POST(request: Request) {
  const token = getBearerToken(request);
  if (!token) {
    return NextResponse.json({ error: 'Missing authentication token' }, { status: 401 });
  }

  try {
    const decoded = await authAdmin.verifyIdToken(token);
    const email = (decoded.email || '').toLowerCase();
    const userRef = dbAdmin.collection('users').doc(decoded.uid);
    const userSnap = await userRef.get();
    const profile = userSnap.exists ? userSnap.data() || {} : null;

    const isAuthorizedDomain = email.endsWith('@airedesantafe.com.ar') || email.endsWith('@airedigital.com');
    const isHardcodedException = email === 'leandrochena@gmail.com';
    const isManagedExternalUser = profile?.externalUser === true && profile?.role === 'Asesor Canjes';

    let isWhitelisted = false;
    if (!isAuthorizedDomain && !isHardcodedException && !isManagedExternalUser) {
      const whitelist = await getEmailWhitelist();
      isWhitelisted = whitelist.some(allowedEmail => allowedEmail.toLowerCase().trim() === email);
    }

    if (!isAuthorizedDomain && !isHardcodedException && !isWhitelisted && !isManagedExternalUser) {
      return NextResponse.json(
        { error: 'Tu correo no pertenece a la organizacion ni esta en la lista de autorizados.' },
        { status: 403 },
      );
    }

    let finalProfile = profile;
    if (!finalProfile) {
      finalProfile = {
        name: decoded.name || decoded.email?.split('@')[0] || 'Usuario',
        email,
        role: 'Asesor',
        photoURL: decoded.picture || null,
        createdAt: FieldValue.serverTimestamp(),
      };
      await userRef.set(finalProfile);
      finalProfile = {
        ...finalProfile,
        createdAt: new Date().toISOString(),
      };
    }

    const serializedProfile = serializeFirestoreValue(finalProfile) as Record<string, unknown>;
    const name = String(serializedProfile.name || decoded.name || 'Usuario');

    return NextResponse.json({
      user: {
        id: decoded.uid,
        ...serializedProfile,
        email: serializedProfile.email || email,
        photoURL: decoded.picture || serializedProfile.photoURL || null,
        initials: name.substring(0, 2).toUpperCase(),
      },
      permissions: await getPermissions(),
    });
  } catch (error: any) {
    const status = error?.code === 'auth/id-token-expired' ? 401 : 500;
    return NextResponse.json(
      { error: status === 401 ? 'Sesion vencida.' : 'No se pudo validar la sesion.' },
      { status },
    );
  }
}
