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

async function getUserProfile(uid: string) {
  try {
    const userRef = dbAdmin.collection('users').doc(uid);
    const userSnap = await userRef.get();
    return {
      userRef,
      profile: userSnap.exists ? userSnap.data() || {} : null,
      readFailed: false,
    };
  } catch (error: any) {
    console.error('AUTH SESSION USER PROFILE FALLBACK:', {
      code: error?.code,
      message: error?.message,
    });
    return {
      userRef: dbAdmin.collection('users').doc(uid),
      profile: null,
      readFailed: true,
    };
  }
}

export async function POST(request: Request) {
  const token = getBearerToken(request);
  if (!token) {
    return NextResponse.json({ error: 'Missing authentication token' }, { status: 401 });
  }

  try {
    const decoded = await authAdmin.verifyIdToken(token);
    const email = (decoded.email || '').toLowerCase();
    const { userRef, profile, readFailed } = await getUserProfile(decoded.uid);

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
      if (!readFailed) {
        try {
          await userRef.set(finalProfile);
        } catch (error: any) {
          console.error('AUTH SESSION USER CREATE FALLBACK:', {
            code: error?.code,
            message: error?.message,
          });
        }
      }
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
    console.error('AUTH SESSION ERROR:', {
      code: error?.code,
      message: error?.message,
    });
    const status = error?.code === 'auth/id-token-expired' ? 401 : 500;
    return NextResponse.json(
      { error: status === 401 ? 'Sesion vencida.' : 'No se pudo validar la sesion.' },
      { status },
    );
  }
}
