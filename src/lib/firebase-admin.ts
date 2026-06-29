import { initializeApp, getApps, cert, getApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore } from 'firebase-admin/firestore';

type ServiceAccountConfig = {
  projectId?: string;
  clientEmail?: string;
  privateKey?: string;
};

const serviceAccountJsonEnvKeys = [
  'FIREBASE_SERVICE_ACCOUNT_KEY',
  'FIREBASE_SERVICE_ACCOUNT',
  'FIREBASE_ADMIN_SERVICE_ACCOUNT',
  'FIREBASE_ADMIN_CREDENTIALS',
  'GOOGLE_APPLICATION_CREDENTIALS_JSON',
  'GOOGLE_CREDENTIALS',
] as const;

const projectIdEnvKeys = [
  'FIREBASE_ADMIN_PROJECT_ID',
  'FIREBASE_PROJECT_ID',
  'GOOGLE_CLOUD_PROJECT',
  'GCLOUD_PROJECT',
  'NEXT_PUBLIC_FIREBASE_PROJECT_ID',
] as const;

const clientEmailEnvKeys = [
  'FIREBASE_ADMIN_CLIENT_EMAIL',
  'FIREBASE_CLIENT_EMAIL',
  'GOOGLE_CLIENT_EMAIL',
] as const;

const privateKeyEnvKeys = [
  'FIREBASE_ADMIN_PRIVATE_KEY',
  'FIREBASE_PRIVATE_KEY',
  'GOOGLE_PRIVATE_KEY',
] as const;

function getEnvValue(key: string): string | undefined {
  switch (key) {
    case 'FIREBASE_SERVICE_ACCOUNT_KEY':
      return process.env.FIREBASE_SERVICE_ACCOUNT_KEY;
    case 'FIREBASE_SERVICE_ACCOUNT':
      return process.env.FIREBASE_SERVICE_ACCOUNT;
    case 'FIREBASE_ADMIN_SERVICE_ACCOUNT':
      return process.env.FIREBASE_ADMIN_SERVICE_ACCOUNT;
    case 'FIREBASE_ADMIN_CREDENTIALS':
      return process.env.FIREBASE_ADMIN_CREDENTIALS;
    case 'GOOGLE_APPLICATION_CREDENTIALS_JSON':
      return process.env.GOOGLE_APPLICATION_CREDENTIALS_JSON;
    case 'GOOGLE_CREDENTIALS':
      return process.env.GOOGLE_CREDENTIALS;
    case 'FIREBASE_ADMIN_PROJECT_ID':
      return process.env.FIREBASE_ADMIN_PROJECT_ID;
    case 'FIREBASE_PROJECT_ID':
      return process.env.FIREBASE_PROJECT_ID;
    case 'GOOGLE_CLOUD_PROJECT':
      return process.env.GOOGLE_CLOUD_PROJECT;
    case 'GCLOUD_PROJECT':
      return process.env.GCLOUD_PROJECT;
    case 'NEXT_PUBLIC_FIREBASE_PROJECT_ID':
      return process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID;
    case 'FIREBASE_ADMIN_CLIENT_EMAIL':
      return process.env.FIREBASE_ADMIN_CLIENT_EMAIL;
    case 'FIREBASE_CLIENT_EMAIL':
      return process.env.FIREBASE_CLIENT_EMAIL;
    case 'GOOGLE_CLIENT_EMAIL':
      return process.env.GOOGLE_CLIENT_EMAIL;
    case 'FIREBASE_ADMIN_PRIVATE_KEY':
      return process.env.FIREBASE_ADMIN_PRIVATE_KEY;
    case 'FIREBASE_PRIVATE_KEY':
      return process.env.FIREBASE_PRIVATE_KEY;
    case 'GOOGLE_PRIVATE_KEY':
      return process.env.GOOGLE_PRIVATE_KEY;
    default:
      return undefined;
  }
}

function firstEnvValue(keys: readonly string[]): string | undefined {
  for (const key of keys) {
    const value = getEnvValue(key)?.trim();
    if (value) return value;
  }
  return undefined;
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

function isPlaceholderProjectId(value?: string): boolean {
  return !value || value === 'dummy-build-project';
}

function inferProjectIdFromClientEmail(value?: string): string | undefined {
  const match = value?.match(/@(.+?)\.iam\.gserviceaccount\.com$/);
  return match?.[1];
}

function resolveProjectId(clientEmail?: string): string | undefined {
  const configuredProjectId = firstEnvValue(projectIdEnvKeys);
  if (!isPlaceholderProjectId(configuredProjectId)) return configuredProjectId;
  return inferProjectIdFromClientEmail(clientEmail);
}

function normalizeEscapedNewlines(value: string): string {
  let normalized = value;
  for (let index = 0; index < 3; index += 1) {
    normalized = normalized.replace(/\\n/g, '\n');
  }
  return normalized.replace(/\r\n/g, '\n');
}

function normalizePrivateKey(value?: string): string | undefined {
  if (!value) return undefined;

  let privateKey = normalizeEscapedNewlines(stripWrappingQuotes(value));
  if (privateKey.includes('-----BEGIN PRIVATE KEY-----')) {
    return privateKey;
  }

  try {
    privateKey = normalizeEscapedNewlines(Buffer.from(privateKey, 'base64').toString('utf8'));
    return privateKey.includes('-----BEGIN PRIVATE KEY-----') ? privateKey : undefined;
  } catch {
    return undefined;
  }
}

function collectServiceAccountJsonCandidates(value: string): string[] {
  const candidates = new Set<string>();
  const add = (candidate?: string) => {
    const normalized = candidate?.trim();
    if (normalized) candidates.add(stripWrappingQuotes(normalized));
  };

  const stripped = stripWrappingQuotes(value);
  add(stripped);
  add(stripped.replace(/\\"/g, '"'));
  add(stripped.replace(/\\\\n/g, '\\n'));
  add(stripped.replace(/\\"/g, '"').replace(/\\\\n/g, '\\n'));

  try {
    add(Buffer.from(stripped, 'base64').toString('utf8'));
  } catch {
    // Puede no venir en base64.
  }

  try {
    add(decodeURIComponent(stripped));
  } catch {
    // Puede no venir URL encoded.
  }

  return Array.from(candidates);
}

function parseServiceAccountJson(value?: string): ServiceAccountConfig | null {
  if (!value) return null;

  for (const candidate of collectServiceAccountJsonCandidates(value)) {
    try {
      const parsedValue = JSON.parse(candidate) as unknown;
      if (typeof parsedValue === 'string') {
        const nestedConfig = parseServiceAccountJson(parsedValue);
        if (nestedConfig) return nestedConfig;
        continue;
      }
      if (!parsedValue || typeof parsedValue !== 'object') continue;

      const parsed = parsedValue as {
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
          projectId: parsedProjectId || resolveProjectId(clientEmail),
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
  const jsonServiceAccount = parseServiceAccountJson(firstEnvValue(serviceAccountJsonEnvKeys));
  if (jsonServiceAccount) return jsonServiceAccount;

  const privateKey = normalizePrivateKey(firstEnvValue(privateKeyEnvKeys));
  const clientEmail = firstEnvValue(clientEmailEnvKeys);
  if (!privateKey || !clientEmail) return null;

  return {
    projectId: resolveProjectId(clientEmail),
    clientEmail,
    privateKey,
  };
}

function createFirebaseAdminApp() {
  if (getApps().length > 0) {
    return getApp();
  }

  const serviceAccount = getExplicitServiceAccount();
  const fallbackProjectId = resolveProjectId(serviceAccount?.clientEmail);
  const fallbackOptions = fallbackProjectId ? { projectId: fallbackProjectId } : undefined;

  if (serviceAccount?.privateKey && serviceAccount.clientEmail) {
    const resolvedProjectId = serviceAccount.projectId || fallbackProjectId;

    try {
      return initializeApp({
        credential: cert({
          projectId: resolvedProjectId,
          clientEmail: serviceAccount.clientEmail,
          privateKey: serviceAccount.privateKey,
        }),
        projectId: resolvedProjectId,
      });
    } catch (error) {
      console.error('[FIREBASE_ADMIN] No se pudo inicializar con credenciales explícitas:', {
        projectId: resolvedProjectId,
        clientEmail: serviceAccount.clientEmail,
        error,
      });
    }
  }

  return initializeApp(fallbackOptions);
}

const app = createFirebaseAdminApp();

export const dbAdmin = getFirestore(app);
export const authAdmin = getAuth(app);
