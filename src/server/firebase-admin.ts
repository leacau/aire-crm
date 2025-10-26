import { applicationDefault, cert, getApps, initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

let app = getApps()[0];

if (!app) {
  const serviceAccountJson = process.env.FIREBASE_SERVICE_ACCOUNT_KEY;
  if (serviceAccountJson) {
    try {
      const serviceAccount = JSON.parse(serviceAccountJson);
      app = initializeApp({
        credential: cert(serviceAccount),
      });
    } catch (error) {
      console.warn('Failed to parse FIREBASE_SERVICE_ACCOUNT_KEY. Falling back to application default credentials.');
      app = initializeApp({
        credential: applicationDefault(),
      });
    }
  } else {
    app = initializeApp({
      credential: applicationDefault(),
    });
  }
}

export const adminDb = getFirestore(app);
adminDb.settings({ ignoreUndefinedProperties: true });
