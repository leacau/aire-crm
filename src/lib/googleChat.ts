import 'server-only';
import { GoogleAuth } from 'google-auth-library';
import { FieldValue, Timestamp } from 'firebase-admin/firestore';
import { getAdminDb } from './firebase-admin';

export type ChatActionParameter = {
  key: string;
  value: string;
};

export type ChatEventUser = {
  name?: string;
  displayName?: string;
  email?: string;
};

export type ChatSpace = {
  name?: string;
  type?: 'DM' | 'ROOM';
};

export type ChatMessage = {
  name?: string;
  thread?: { name?: string };
  space?: ChatSpace;
  text?: string;
};

export type ChatEvent = {
  type?: string;
  action?: { actionMethodName?: string; parameters?: ChatActionParameter[] };
  message?: ChatMessage;
  user?: ChatEventUser;
  space?: ChatSpace;
  messageSender?: ChatEventUser;
  thread?: { name?: string };
  argumentText?: string;
};

const CHAT_SCOPES = ['https://www.googleapis.com/auth/chat.bot'];

function getChatCredentials() {
  const projectId = process.env.GOOGLE_CHAT_PROJECT_ID;
  const clientEmail = process.env.GOOGLE_CHAT_CLIENT_EMAIL;
  const privateKey = process.env.GOOGLE_CHAT_PRIVATE_KEY?.replace(/\\n/g, '\n');

  if (!projectId || !clientEmail || !privateKey) {
    throw new Error('Faltan variables de entorno de Google Chat (PROJECT_ID, CLIENT_EMAIL, PRIVATE_KEY).');
  }

  return { projectId, clientEmail, privateKey } as const;
}

export function getChatAuthClient() {
  const { clientEmail, privateKey } = getChatCredentials();

  return new GoogleAuth({
    credentials: { client_email: clientEmail, private_key: privateKey },
    scopes: CHAT_SCOPES,
  });
}

async function getAccessToken() {
  const auth = getChatAuthClient();
  const client = await auth.getClient();
  const token = await client.getAccessToken();
  if (!token) throw new Error('No se pudo obtener un token de acceso para Google Chat.');
  return token;
}

export async function sendMessage(spaceName: string, message: any) {
  const accessToken = await getAccessToken();
  const response = await fetch(`https://chat.googleapis.com/v1/${spaceName}/messages`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(message),
  });

  if (!response.ok) {
    const errorText = await response.text().catch(() => '');
    throw new Error(
      `Error enviando mensaje a ${spaceName}: ${response.status} ${(errorText || response.statusText).trim()}`,
    );
  }

  return response.json();
}

export async function listSpaceMessages(spaceName: string, options?: { pageSize?: number }) {
  const accessToken = await getAccessToken();
  const pageSize = options?.pageSize ?? 30;

  const response = await fetch(
    `https://chat.googleapis.com/v1/${spaceName}/messages?orderBy=DESCENDING&pageSize=${pageSize}`,
    {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
    },
  );

  if (!response.ok) {
    const errorText = await response.text().catch(() => '');
    throw new Error(
      `No se pudieron obtener los mensajes del espacio ${spaceName}: ${response.status} ${(errorText || response.statusText).trim()}`,
    );
  }

  const data = await response.json();
  const messages = (data?.messages as ChatMessage[] | undefined) || [];
  return messages.reverse();
}

export async function updateMessage(messageName: string, patch: Record<string, unknown>) {
  const accessToken = await getAccessToken();
  const updateMask = Object.keys(patch).join(',');

  const response = await fetch(`https://chat.googleapis.com/v1/${messageName}?updateMask=${updateMask}`, {
    method: 'PATCH',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(patch),
  });

  if (!response.ok) {
    const errorText = await response.text().catch(() => '');
    throw new Error(
      `No se pudo actualizar el mensaje ${messageName}: ${response.status} ${(errorText || response.statusText).trim()}`,
    );
  }

  return response.json();
}

export async function replyInThread(spaceName: string, threadName: string, text: string) {
  return sendMessage(spaceName, { text, thread: { name: threadName } });
}

export async function getSpaceNameByKey(key: string) {
  const db = getAdminDb();
  const directDoc = await db.collection('chatSpaces').doc(key).get();
  if (directDoc.exists) {
    const data = directDoc.data();
    if (data?.spaceName) return data.spaceName as string;
  }

  const snapshot = await db.collection('chatSpaces').where('key', '==', key).limit(1).get();
  if (!snapshot.empty) {
    const data = snapshot.docs[0].data();
    if (data?.spaceName) return data.spaceName as string;
  }

  return null;
}

async function findDmSpaceByEmail(email: string) {
  const db = getAdminDb();
  const emailDoc = await db.collection('userByEmail').doc(email).get();
  if (emailDoc.exists) {
    return (emailDoc.data()?.googleChat as any)?.dmSpace as string | undefined;
  }

  const userDoc = await db.collection('users').doc(email).get();
  if (userDoc.exists) {
    return (userDoc.data()?.googleChat as any)?.dmSpace as string | undefined;
  }

  return undefined;
}

export async function sendDmToEmail(email: string, text: string) {
  const dmSpace = await findDmSpaceByEmail(email);
  if (!dmSpace) return null;

  return sendMessage(dmSpace, { text });
}

export async function registerDmSpace(email: string, spaceName: string) {
  const db = getAdminDb();
  await db.collection('userByEmail').doc(email).set(
    {
      googleChat: {
        dmSpace: spaceName,
        updatedAt: Timestamp.now(),
      },
    },
    { merge: true },
  );
}

export async function saveApprovalRequest(params: {
  requestId: string;
  title: string;
  description?: string;
  amount?: number;
  requestedByEmail: string;
  lastMessage: { spaceName: string; messageName: string; threadName?: string | null };
}) {
  const { requestId, title, description, amount, requestedByEmail, lastMessage } = params;
  const db = getAdminDb();
  await db
    .collection('approvalRequests')
    .doc(requestId)
    .set({
      status: 'PENDING',
      title,
      description: description || null,
      amount: amount ?? null,
      requestedByEmail,
      createdAt: FieldValue.serverTimestamp(),
      lastMessage,
    });
}

export async function updateApprovalDecision(params: {
  requestId: string;
  status: 'APPROVED' | 'REJECTED';
  decidedBy: string;
}) {
  const db = getAdminDb();
  await db
    .collection('approvalRequests')
    .doc(params.requestId)
    .set(
      {
        status: params.status,
        decidedBy: params.decidedBy,
        decidedAt: FieldValue.serverTimestamp(),
      },
      { merge: true },
    );
}

export async function getApprovalRequest(requestId: string) {
  const doc = await getAdminDb().collection('approvalRequests').doc(requestId).get();
  return doc.exists ? doc.data() : null;
}
