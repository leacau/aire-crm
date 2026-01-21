import { initializeApp, getApps, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

// Estas variables de entorno se deben configurar en Vercel / .env.local
const serviceAccount = {
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
  privateKey: process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
};

// Evitar inicializar múltiples veces en desarrollo
if (!getApps().length) {
  // Verificamos que existan las credenciales para evitar errores en build time si faltan
  if (serviceAccount.projectId && serviceAccount.clientEmail && serviceAccount.privateKey) {
      initializeApp({
        credential: cert(serviceAccount),
      });
  } else {
      // Fallback para build time o si faltan vars (evita crash total)
       initializeApp();
  }
}

export const dbAdmin = getFirestore();
