import { FieldValue } from 'firebase-admin/firestore';
import { authAdmin, dbAdmin } from '@/lib/firebase-admin';
import { defaultPermissions } from '@/lib/data';
import { serializeFirestoreValue } from '@/lib/server/firestore';

const AREA_PERMISSIONS_DOC_ID = 'area_permissions';
const EMAIL_WHITELIST_DOC_ID = 'email_whitelist';

type DecodedToken = Awaited<ReturnType<typeof authAdmin.verifyIdToken>>;

export class AuthSessionApiError extends Error {
  constructor(
    message: string,
    public readonly status = 400,
  ) {
    super(message);
  }
}

async function getPermissions() {
  try {
    const docRef = dbAdmin.collection('system_config').doc(AREA_PERMISSIONS_DOC_ID);
    const snap = await docRef.get();

    if (snap.exists) {
      return snap.data()?.permissions || defaultPermissions;
    }

    await docRef.set({ permissions: defaultPermissions });
  } catch (error: any) {
    console.error('AUTH SESSION PERMISSIONS FALLBACK:', {
      code: error?.code,
      message: error?.message,
    });
  }

  return defaultPermissions;
}

async function getEmailWhitelist(): Promise<string[]> {
  try {
    const snap = await dbAdmin.collection('system_config').doc(EMAIL_WHITELIST_DOC_ID).get();
    const emails = snap.exists ? snap.data()?.emails : [];
    return Array.isArray(emails) ? emails : [];
  } catch (error: any) {
    console.error('AUTH SESSION WHITELIST FALLBACK:', {
      code: error?.code,
      message: error?.message,
    });
    return [];
  }
}

function buildDefaultProfile(decoded: DecodedToken, email: string) {
  return {
    name: decoded.name || decoded.email?.split('@')[0] || 'Usuario',
    email,
    role: email === 'leandrochena@gmail.com' ? 'Admin' : 'Asesor',
    photoURL: decoded.picture || null,
    createdAt: new Date().toISOString(),
  };
}

async function getUserProfile(decoded: DecodedToken, email: string): Promise<Record<string, any>> {
  const userRef = dbAdmin.collection('users').doc(decoded.uid);

  try {
    const userSnap = await userRef.get();
    if (userSnap.exists) return userSnap.data() || {};
  } catch (error: any) {
    console.error('AUTH SESSION USER PROFILE FALLBACK:', {
      uid: decoded.uid,
      code: error?.code,
      message: error?.message,
    });
    return buildDefaultProfile(decoded, email);
  }

  const fallbackProfile = {
    ...buildDefaultProfile(decoded, email),
    createdAt: FieldValue.serverTimestamp(),
  };

  try {
    await userRef.set(fallbackProfile);
  } catch (error: any) {
    console.error('AUTH SESSION USER CREATE FALLBACK:', {
      uid: decoded.uid,
      code: error?.code,
      message: error?.message,
    });
  }

  return {
    ...fallbackProfile,
    createdAt: new Date().toISOString(),
  };
}

function isAuthorizedDomain(email: string) {
  return email.endsWith('@airedesantafe.com.ar') || email.endsWith('@airedigital.com');
}

function isHardcodedException(email: string) {
  return email === 'leandrochena@gmail.com';
}

function buildSessionResponse(decoded: DecodedToken, profile: Record<string, unknown>, email: string, permissions: unknown) {
  const serializedProfile = serializeFirestoreValue(profile) as Record<string, unknown>;
  const name = String(serializedProfile.name || decoded.name || 'Usuario');

  return {
    user: {
      id: decoded.uid,
      ...serializedProfile,
      email: serializedProfile.email || email,
      photoURL: decoded.picture || serializedProfile.photoURL || null,
      initials: name.substring(0, 2).toUpperCase(),
    },
    permissions,
  };
}

async function verifySessionToken(token: string): Promise<DecodedToken> {
  try {
    return await authAdmin.verifyIdToken(token);
  } catch (error: any) {
    console.error('AUTH SESSION TOKEN ERROR:', {
      code: error?.code,
      message: error?.message,
    });
    throw new AuthSessionApiError('Sesion vencida.', 401);
  }
}

export async function validateAuthSessionServer(token: string) {
  const decoded = await verifySessionToken(token);

  try {
    const email = (decoded.email || '').toLowerCase();
    const profile = await getUserProfile(decoded, email);
    const managedExternalUser = profile?.externalUser === true && profile?.role === 'Asesor Canjes';

    let whitelisted = false;
    if (!isAuthorizedDomain(email) && !isHardcodedException(email) && !managedExternalUser) {
      const whitelist = await getEmailWhitelist();
      whitelisted = whitelist.some(allowedEmail => allowedEmail.toLowerCase().trim() === email);
    }

    if (!isAuthorizedDomain(email) && !isHardcodedException(email) && !whitelisted && !managedExternalUser) {
      throw new AuthSessionApiError('Tu correo no pertenece a la organizacion ni esta en la lista de autorizados.', 403);
    }

    return buildSessionResponse(decoded, profile, email, await getPermissions());
  } catch (error: any) {
    if (error instanceof AuthSessionApiError) throw error;

    console.error('AUTH SESSION ERROR:', {
      code: error?.code,
      message: error?.message,
    });

    const email = (decoded.email || '').toLowerCase();
    if (!isAuthorizedDomain(email) && !isHardcodedException(email)) {
      throw new AuthSessionApiError('Tu correo no pertenece a la organizacion ni esta en la lista de autorizados.', 403);
    }

    return buildSessionResponse(decoded, buildDefaultProfile(decoded, email), email, defaultPermissions);
  }
}
