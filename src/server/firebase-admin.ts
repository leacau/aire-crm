import {App, cert, getApps, initializeApp} from 'firebase-admin/app';
import {getAuth, type DecodedIdToken} from 'firebase-admin/auth';
import {Firestore, getFirestore} from 'firebase-admin/firestore';

type FirebaseAdminConfig = {
  projectId: string;
  clientEmail: string;
  privateKey: string;
};

let firebaseAdminApp: App | undefined;

function loadConfigFromEnv(): FirebaseAdminConfig {
  const projectId = process.env.FIREBASE_ADMIN_PROJECT_ID;
  const clientEmail = process.env.FIREBASE_ADMIN_CLIENT_EMAIL;
  const privateKey = process.env.FIREBASE_ADMIN_PRIVATE_KEY;

  if (!projectId || !clientEmail || !privateKey) {
    throw new Error('Missing Firebase Admin environment variables.');
  }

  return {
    projectId,
    clientEmail,
    privateKey: privateKey.replace(/\\n/g, '\n'),
  };
}

function getFirebaseAdminApp(): App {
  if (!firebaseAdminApp) {
    const config = loadConfigFromEnv();

    firebaseAdminApp = getApps()[0] ?? initializeApp({
      credential: cert({
        projectId: config.projectId,
        clientEmail: config.clientEmail,
        privateKey: config.privateKey,
      }),
    });
  }

  return firebaseAdminApp;
}

export function getFirestoreAdmin(): Firestore {
  return getFirestore(getFirebaseAdminApp());
}

export async function verifyIdToken(idToken: string): Promise<DecodedIdToken> {
  const auth = getAuth(getFirebaseAdminApp());
  return auth.verifyIdToken(idToken);
}
