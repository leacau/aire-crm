import 'server-only';
import { cert, getApps, initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

function getFirebaseConfig() {
  const projectId = process.env.FIREBASE_PROJECT_ID || process.env.GOOGLE_CHAT_PROJECT_ID;
  const clientEmail = process.env.FIREBASE_CLIENT_EMAIL || process.env.GOOGLE_CHAT_CLIENT_EMAIL;
  const privateKey = (process.env.FIREBASE_PRIVATE_KEY || process.env.GOOGLE_CHAT_PRIVATE_KEY)?.replace(/\\n/g, '\n');

  if (!projectId || !clientEmail || !privateKey) {
    throw new Error('Configura FIREBASE_PROJECT_ID, FIREBASE_CLIENT_EMAIL y FIREBASE_PRIVATE_KEY para usar Firestore.');
  }

  return { projectId, clientEmail, privateKey } as const;
}

function initFirebaseAdmin() {
  const { projectId, clientEmail, privateKey } = getFirebaseConfig();

  if (!getApps().length) {
    initializeApp({
      credential: cert({ projectId, clientEmail, privateKey }),
    });
  }
}

export function getAdminDb() {
  initFirebaseAdmin();
  return getFirestore();
}
