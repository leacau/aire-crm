import { initializeApp, getApps, cert, getApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore } from 'firebase-admin/firestore';

const serviceAccount = {
  projectId: process.env.FIREBASE_PROJECT_ID || process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
  privateKey: process.env.FIREBASE_PRIVATE_KEY || process.env.FIREBASE_PRIVATE_KEY_BASE64,
};

function normalizePrivateKey(value: string) {
  let privateKey = value.trim();

  if (privateKey.startsWith('"') && privateKey.endsWith('"')) {
    privateKey = privateKey.slice(1, -1);
  }

  privateKey = privateKey.replace(/\\n/g, '\n');

  if (!privateKey.includes('-----BEGIN PRIVATE KEY-----')) {
    try {
      const decoded = Buffer.from(privateKey, 'base64').toString('utf8').trim();
      if (decoded.includes('-----BEGIN PRIVATE KEY-----')) {
        privateKey = decoded.replace(/\\n/g, '\n');
      }
    } catch {
      // cert() will surface a precise credential error if this was not base64.
    }
  }

  return privateKey;
}

function createFirebaseAdminApp() {
  if (getApps().length > 0) {
    return getApp();
  }

  if (serviceAccount.projectId && serviceAccount.privateKey && serviceAccount.clientEmail) {
    try {
      return initializeApp({
        credential: cert({
          projectId: serviceAccount.projectId,
          clientEmail: serviceAccount.clientEmail,
          privateKey: normalizePrivateKey(serviceAccount.privateKey),
        }),
        projectId: serviceAccount.projectId,
      });
    } catch (error: any) {
      console.error('FIREBASE ADMIN INIT ERROR:', {
        message: error?.message,
        hasProjectId: Boolean(serviceAccount.projectId),
        hasClientEmail: Boolean(serviceAccount.clientEmail),
        hasPrivateKey: Boolean(serviceAccount.privateKey),
      });
      throw error;
    }
  }

  if (process.env.VERCEL || process.env.NETLIFY) {
    console.error('FIREBASE ADMIN ENV ERROR:', {
      hasProjectId: Boolean(serviceAccount.projectId),
      hasClientEmail: Boolean(serviceAccount.clientEmail),
      hasPrivateKey: Boolean(serviceAccount.privateKey),
    });
    throw new Error(
      'Faltan variables de Firebase Admin: FIREBASE_PROJECT_ID, FIREBASE_CLIENT_EMAIL y FIREBASE_PRIVATE_KEY.',
    );
  }

  return initializeApp();
}

const app = createFirebaseAdminApp();

export const firebaseAdminApp = app;
export const dbAdmin = getFirestore(app);
export const authAdmin = getAuth(app);
