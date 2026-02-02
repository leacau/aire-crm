import { initializeApp, getApps, cert, getApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

const serviceAccount = {
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
  privateKey: process.env.FIREBASE_PRIVATE_KEY,
};

function createFirebaseAdminApp() {
  // Si ya existe una app inicializada, úsala (evita hot-reload errors)
  if (getApps().length > 0) {
    return getApp();
  }

  // Verificar si tenemos credenciales para inicializar
  if (serviceAccount.privateKey && serviceAccount.clientEmail) {
    try {
        // --- SANITIZACIÓN DE LA CLAVE PRIVADA ---
        let privateKey = serviceAccount.privateKey;

        // 1. Eliminar comillas dobles al inicio y final si se copiaron por error en Vercel
        //    Ej: "-----BEGIN..." -> -----BEGIN...
        if (privateKey.startsWith('"') && privateKey.endsWith('"')) {
            privateKey = privateKey.slice(1, -1);
        }

        // 2. Reemplazar los caracteres literales '\n' por saltos de línea reales
        //    Esto es crucial porque Vercel/Env suelen aplanar el string.
        privateKey = privateKey.replace(/\\n/g, '\n');

        return initializeApp({
            credential: cert({
                projectId: serviceAccount.projectId,
                clientEmail: serviceAccount.clientEmail,
                privateKey: privateKey,
            }),
        });
    } catch (error) {
        console.error('FIREBASE ADMIN INIT ERROR: La clave privada es inválida.', error);
        // En caso de error crítico en credenciales, retornamos la app por defecto 
        // para no romper el build estático, aunque fallará al intentar leer datos reales.
    }
  }

  // Fallback: Intenta inicializar sin credenciales explícitas (ej: entorno Google Cloud)
  return initializeApp();
}

const app = createFirebaseAdminApp();

export const dbAdmin = getFirestore(app);
