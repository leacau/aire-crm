import crypto from 'crypto';
import { FieldValue } from 'firebase-admin/firestore';
import { getMessaging, type MulticastMessage } from 'firebase-admin/messaging';
import { dbAdmin, firebaseAdminApp } from '@/lib/firebase-admin';
import { hasServerManagementPrivileges, type ServerUser } from '@/lib/server/auth';

export type NotificationPlatform = 'web' | 'android' | 'ios';

export type RegisterNotificationTokenInput = {
  token?: unknown;
  platform?: unknown;
  app?: unknown;
  deviceId?: unknown;
  userAgent?: unknown;
};

export type SendNotificationInput = {
  userIds?: unknown;
  title?: unknown;
  body?: unknown;
  data?: unknown;
  link?: unknown;
};

type NotificationTokenRecord = {
  token: string;
  userId: string;
  userEmail?: string;
  userName?: string;
  platform: NotificationPlatform;
  app: 'web' | 'mobile';
  deviceId?: string;
  userAgent?: string;
  enabled: boolean;
  createdAt?: FirebaseFirestore.FieldValue;
  updatedAt: FirebaseFirestore.FieldValue;
  lastSeenAt: FirebaseFirestore.FieldValue;
  disabledAt?: FirebaseFirestore.FieldValue;
  invalidatedAt?: FirebaseFirestore.FieldValue;
};

const TOKEN_COLLECTION = 'notificationTokens';
const VALID_PLATFORMS = new Set<NotificationPlatform>(['web', 'android', 'ios']);
const MAX_MULTICAST_TOKENS = 500;
const MAX_QUERY_IN_VALUES = 10;

export class NotificationApiError extends Error {
  constructor(message: string, public readonly status: number) {
    super(message);
    this.name = 'NotificationApiError';
  }
}

function normalizeString(value: unknown, maxLength = 500) {
  return typeof value === 'string' ? value.trim().slice(0, maxLength) : '';
}

function getTokenDocId(token: string) {
  return crypto.createHash('sha256').update(token).digest('hex');
}

function chunk<T>(items: T[], size: number) {
  const chunks: T[][] = [];
  for (let index = 0; index < items.length; index += size) {
    chunks.push(items.slice(index, index + size));
  }
  return chunks;
}

function normalizeDataPayload(value: unknown): Record<string, string> | undefined {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined;

  const data: Record<string, string> = {};
  for (const [key, rawValue] of Object.entries(value)) {
    const safeKey = key.trim();
    if (!safeKey) continue;
    if (rawValue == null) continue;
    data[safeKey] = typeof rawValue === 'string' ? rawValue : JSON.stringify(rawValue);
  }

  return Object.keys(data).length ? data : undefined;
}

function assertCanSendNotifications(requester: ServerUser) {
  if (!hasServerManagementPrivileges(requester)) {
    throw new NotificationApiError('Forbidden', 403);
  }
}

export async function registerNotificationTokenServer(input: RegisterNotificationTokenInput, requester: ServerUser) {
  const token = normalizeString(input.token, 4096);
  const platform = normalizeString(input.platform, 20) as NotificationPlatform;
  const app = normalizeString(input.app, 20) === 'web' ? 'web' : 'mobile';

  if (!token) throw new NotificationApiError('El token de notificacion es obligatorio.', 400);
  if (!VALID_PLATFORMS.has(platform)) throw new NotificationApiError('La plataforma de notificacion no es valida.', 400);

  const docId = getTokenDocId(token);
  const ref = dbAdmin.collection(TOKEN_COLLECTION).doc(docId);
  const snapshot = await ref.get();
  const now = FieldValue.serverTimestamp();
  const record: NotificationTokenRecord = {
    token,
    userId: requester.uid,
    userEmail: requester.email || '',
    userName: requester.name || '',
    platform,
    app,
    deviceId: normalizeString(input.deviceId, 200),
    userAgent: normalizeString(input.userAgent, 500),
    enabled: true,
    updatedAt: now,
    lastSeenAt: now,
  };

  if (!snapshot.exists) {
    record.createdAt = now;
  }

  await ref.set(record, { merge: true });

  return { id: docId };
}

export async function unregisterNotificationTokenServer(rawToken: unknown, requester: ServerUser) {
  const token = normalizeString(rawToken, 4096);
  if (!token) throw new NotificationApiError('El token de notificacion es obligatorio.', 400);

  const ref = dbAdmin.collection(TOKEN_COLLECTION).doc(getTokenDocId(token));
  const snapshot = await ref.get();
  if (!snapshot.exists) return;

  const data = snapshot.data();
  if (data?.userId !== requester.uid && !hasServerManagementPrivileges(requester)) {
    throw new NotificationApiError('Forbidden', 403);
  }

  await ref.set({
    enabled: false,
    disabledAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
  }, { merge: true });
}

async function listActiveNotificationTokens(userIds: string[]) {
  const ids = Array.from(new Set(userIds.map(id => id.trim()).filter(Boolean)));
  if (!ids.length) return [];

  const snapshots = await Promise.all(
    chunk(ids, MAX_QUERY_IN_VALUES).map(idChunk => (
      dbAdmin.collection(TOKEN_COLLECTION)
        .where('userId', 'in', idChunk)
        .get()
    )),
  );

  return snapshots.flatMap(snapshot => snapshot.docs.map(doc => ({
    id: doc.id,
    ...(doc.data() as NotificationTokenRecord),
  }))).filter(record => record.enabled && Boolean(record.token));
}

async function invalidateNotificationTokens(tokens: string[]) {
  const uniqueTokens = Array.from(new Set(tokens.filter(Boolean)));
  if (!uniqueTokens.length) return;

  for (const tokenChunk of chunk(uniqueTokens, 450)) {
    const batch = dbAdmin.batch();
    tokenChunk.forEach(token => {
      batch.set(dbAdmin.collection(TOKEN_COLLECTION).doc(getTokenDocId(token)), {
        enabled: false,
        invalidatedAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
      }, { merge: true });
    });
    await batch.commit();
  }
}

function getInvalidTokens(tokens: string[], responses: Array<{ success: boolean; error?: { code?: string } }>) {
  const invalidCodes = new Set([
    'messaging/invalid-registration-token',
    'messaging/registration-token-not-registered',
  ]);

  return responses
    .map((response, index) => (!response.success && response.error?.code && invalidCodes.has(response.error.code) ? tokens[index] : ''))
    .filter(Boolean);
}

export async function sendNotificationToUsersServer(input: SendNotificationInput, requester: ServerUser) {
  assertCanSendNotifications(requester);

  const userIds = Array.isArray(input.userIds)
    ? input.userIds.map(id => normalizeString(id, 200)).filter(Boolean)
    : [];
  const title = normalizeString(input.title, 120);
  const body = normalizeString(input.body, 500);
  const link = normalizeString(input.link, 500);
  const data = normalizeDataPayload(input.data) || {};

  if (!userIds.length) throw new NotificationApiError('Debe indicar al menos un usuario destinatario.', 400);
  if (!title) throw new NotificationApiError('El titulo de la notificacion es obligatorio.', 400);

  const records = await listActiveNotificationTokens(userIds);
  const tokens = Array.from(new Set(records.map(record => record.token)));
  if (!tokens.length) {
    return { sent: 0, failed: 0, tokens: 0 };
  }

  let sent = 0;
  let failed = 0;
  const invalidTokens: string[] = [];

  for (const tokenChunk of chunk(tokens, MAX_MULTICAST_TOKENS)) {
    const message: MulticastMessage = {
      tokens: tokenChunk,
      notification: { title, body },
      data: {
        ...data,
        click_action: link || data.click_action || '/dashboard',
      },
      android: {
        priority: 'high',
        notification: {
          channelId: 'default',
          sound: 'default',
        },
      },
      webpush: {
        notification: {
          title,
          body,
          icon: '/logo.webp',
        },
        fcmOptions: link ? { link } : undefined,
      },
    };

    const result = await getMessaging(firebaseAdminApp).sendEachForMulticast(message);
    sent += result.successCount;
    failed += result.failureCount;
    invalidTokens.push(...getInvalidTokens(tokenChunk, result.responses));
  }

  await invalidateNotificationTokens(invalidTokens);

  return { sent, failed, tokens: tokens.length };
}
