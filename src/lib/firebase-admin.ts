import { initializeApp, getApps, cert, getApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore } from 'firebase-admin/firestore';

type ServiceAccountConfig = {
  projectId?: string;
  clientEmail?: string;
  privateKey?: string;
};

function inferProjectIdFromClientEmail(value?: string): string | undefined {
  const match = value?.match(/@(.+?)\.iam\.gserviceaccount\.com$/);
  return match?.[1];
}

function resolveProjectId(clientEmail?: string): string | undefined {
  return (
    process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID ||
    process.env.FIREBASE_PROJECT_ID ||
    inferProjectIdFromClientEmail(clientEmail)
  );
}

function resolveRuntimeProjectId(clientEmail?: string): string | undefined {
  return (
    resolveProjectId(clientEmail) ||
    process.env.GCLOUD_PROJECT ||
    process.env.GOOGLE_CLOUD_PROJECT
  );
}

function stripWrappingQuotes(value: string): string {
  const trimmed = value.trim();
  if (
    (trimmed.startsWith('"') && trimmed.endsWith('"')) ||
    (trimmed.startsWith("'") && trimmed.endsWith("'"))
  ) {
    return trimmed.slice(1, -1);
  }
  return trimmed;
}

function normalizePrivateKey(value?: string): string | undefined {
  if (!value) return undefined;

  let privateKey = stripWrappingQuotes(value).replace(/\\n/g, '\n');
  if (privateKey.includes('-----BEGIN PRIVATE KEY-----')) {
    return privateKey;
  }

  try {
    privateKey = Buffer.from(privateKey, 'base64').toString('utf8').replace(/\\n/g, '\n');
    return privateKey.includes('-----BEGIN PRIVATE KEY-----') ? privateKey : undefined;
  } catch {
    return undefined;
  }
}

function parseServiceAccountJson(value?: string): ServiceAccountConfig | null {
  if (!value) return null;

  const candidates = [stripWrappingQuotes(value)];
  try {
    candidates.push(Buffer.from(candidates[0], 'base64').toString('utf8'));
  } catch {
    // Ignoramos: puede no venir en base64.
  }

  for (const candidate of candidates) {
    try {
      const parsed = JSON.parse(candidate) as {
        project_id?: string;
        projectId?: string;
        client_email?: string;
        clientEmail?: string;
        private_key?: string;
        privateKey?: string;
      };

      const privateKey = normalizePrivateKey(parsed.private_key || parsed.privateKey);
      const clientEmail = parsed.client_email || parsed.clientEmail;
      const parsedProjectId = parsed.project_id || parsed.projectId;

      if (privateKey && clientEmail) {
        return {
          projectId: resolveProjectId(clientEmail) || parsedProjectId,
          clientEmail,
          privateKey,
        };
      }
    } catch {
      // Probamos el siguiente formato posible.
    }
  }

  return null;
}

function getExplicitServiceAccount(): ServiceAccountConfig | null {
  const jsonServiceAccount = parseServiceAccountJson(
    process.env.FIREBASE_SERVICE_ACCOUNT_KEY || process.env.FIREBASE_SERVICE_ACCOUNT,
  );
  if (jsonServiceAccount) return jsonServiceAccount;

  const privateKey = normalizePrivateKey(process.env.FIREBASE_PRIVATE_KEY);
  if (!privateKey || !process.env.FIREBASE_CLIENT_EMAIL) return null;

  return {
    projectId: resolveProjectId(process.env.FIREBASE_CLIENT_EMAIL),
    clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
    privateKey,
  };
}

function createFirebaseAdminApp() {
  if (getApps().length > 0) {
    return getApp();
  }

  const serviceAccount = getExplicitServiceAccount();

  if (serviceAccount?.privateKey && serviceAccount.clientEmail) {
    const resolvedProjectId = serviceAccount.projectId || resolveRuntimeProjectId(serviceAccount.clientEmail);

    return initializeApp({
      credential: cert({
        projectId: resolvedProjectId,
        clientEmail: serviceAccount.clientEmail,
        privateKey: serviceAccount.privateKey,
      }),
      projectId: resolvedProjectId,
    });
  }

  const fallbackProjectId = resolveRuntimeProjectId();
  return initializeApp(fallbackProjectId ? { projectId: fallbackProjectId } : undefined);
}

const app = createFirebaseAdminApp();

export const dbAdmin = getFirestore(app);
export const authAdmin = getAuth(app);
