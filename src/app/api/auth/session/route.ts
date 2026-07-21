import { NextResponse } from 'next/server';
import { FieldValue } from 'firebase-admin/firestore';
import { authAdmin, dbAdmin } from '@/lib/firebase-admin';
import { getBearerToken } from '@/lib/server/auth';
import { defaultPermissions } from '@/lib/data';
import { serializeFirestoreValue } from '@/lib/server/firestore';

const AREA_PERMISSIONS_DOC_ID = 'area_permissions';
const EMAIL_WHITELIST_DOC_ID = 'email_whitelist';

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

function buildDefaultProfile(decoded: Awaited<ReturnType<typeof authAdmin.verifyIdToken>>, email: string) {
  return {
    name: decoded.name || decoded.email?.split('@')[0] || 'Usuario',
    email,
    role: email === 'leandrochena@gmail.com' ? 'Admin' : 'Asesor',
    photoURL: decoded.picture || null,
    createdAt: new Date().toISOString(),
  };
}

async function getUserProfile(
  decoded: Awaited<ReturnType<typeof authAdmin.verifyIdToken>>,
  email: string,
): Promise<Record<string, any>> {
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

export async function POST(request: Request) {
  const token = getBearerToken(request);
  if (!token) {
    return NextResponse.json({ error: 'Missing authentication token' }, { status: 401 });
  }

  let decoded: Awaited<ReturnType<typeof authAdmin.verifyIdToken>>;
  try {
    decoded = await authAdmin.verifyIdToken(token);
  } catch (error: any) {
    console.error('AUTH SESSION TOKEN ERROR:', {
      code: error?.code,
      message: error?.message,
    });
    return NextResponse.json({ error: 'Sesion vencida.' }, { status: 401 });
  }

  try {
    const email = (decoded.email || '').toLowerCase();
    const profile = await getUserProfile(decoded, email);

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

    const serializedProfile = serializeFirestoreValue(profile) as Record<string, unknown>;
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
    console.error('AUTH SESSION ERROR:', {
      code: error?.code,
      message: error?.message,
    });

    const email = (decoded.email || '').toLowerCase();
    const isAuthorizedDomain = email.endsWith('@airedesantafe.com.ar') || email.endsWith('@airedigital.com');
    const isHardcodedException = email === 'leandrochena@gmail.com';

    if (!isAuthorizedDomain && !isHardcodedException) {
      return NextResponse.json(
        { error: 'Tu correo no pertenece a la organizacion ni esta en la lista de autorizados.' },
        { status: 403 },
      );
    }

    const fallbackProfile = serializeFirestoreValue(buildDefaultProfile(decoded, email)) as Record<string, unknown>;
    const name = String(fallbackProfile.name || decoded.name || 'Usuario');

    return NextResponse.json({
      user: {
        id: decoded.uid,
        ...fallbackProfile,
        email: fallbackProfile.email || email,
        photoURL: decoded.picture || fallbackProfile.photoURL || null,
        initials: name.substring(0, 2).toUpperCase(),
      },
      permissions: defaultPermissions,
    });
  }
}
