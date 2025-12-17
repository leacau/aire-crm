export class ChatServiceError extends Error {
  status?: number;

  constructor(message: string, status?: number) {
    super(message);
    this.name = 'ChatServiceError';
    this.status = status;
  }
}

type ChatMessageInput = {
  text: string;
  threadKey?: string;
  webhookUrl?: string;
};

type ChatApiMessageInput = {
  accessToken: string;
  space: string;
  text: string;
  threadName?: string;
};

type ChatMessage = {
  name: string;
  text: string;
  createTime?: string;
  sender?: { displayName?: string; name?: string };
  thread?: { name?: string };
};

function normalizeSpaceName(space: string | null | undefined) {
  if (!space) return space;
  return space.startsWith('spaces/') ? space : `spaces/${space}`;
}

export async function sendChatMessage({ text, threadKey, webhookUrl }: ChatMessageInput) {
  const targetUrl = webhookUrl || process.env.GOOGLE_CHAT_WEBHOOK_URL;

  if (!targetUrl) {
    throw new ChatServiceError('GOOGLE_CHAT_WEBHOOK_URL no está configurado.', 400);
  }

  let url: URL;
  try {
    url = new URL(targetUrl);
  } catch (error) {
    throw new ChatServiceError('El webhook configurado no es una URL válida.', 400);
  }

  if (url.protocol !== 'https:') {
    throw new ChatServiceError('El webhook de Google Chat debe usar HTTPS.', 400);
  }

  if (threadKey) {
    url.searchParams.set('threadKey', threadKey);
  }

  const response = await fetch(url.toString(), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ text }),
  });

  if (!response.ok) {
    const errorText = await response.text().catch(() => '');
    throw new ChatServiceError(
      `Error de Google Chat (${response.status}): ${(errorText || response.statusText).trim()}`,
      response.status,
    );
  }
}

function getBaseApiHeaders(accessToken: string) {
  return {
    Authorization: `Bearer ${accessToken}`,
    'Content-Type': 'application/json',
  } satisfies HeadersInit;
}

export function getSpaceFromWebhook(webhookUrl?: string | null) {
  if (!webhookUrl) return null;
  try {
    const parsed = new URL(webhookUrl);
    const pathParts = parsed.pathname.split('/');
    const spaceIndex = pathParts.findIndex((part) => part === 'spaces');
    if (spaceIndex >= 0 && pathParts[spaceIndex + 1]) {
      return decodeURIComponent(pathParts[spaceIndex + 1]);
    }
  } catch (error) {
    console.warn('No se pudo parsear el webhook de Chat para extraer el espacio', error);
  }
  return null;
}

export async function findDirectMessageSpace(accessToken: string, userEmail: string) {
  const response = await fetch('https://chat.googleapis.com/v1/spaces:findDirectMessage', {
    method: 'POST',
    headers: getBaseApiHeaders(accessToken),
    body: JSON.stringify({ requestedUser: `users/${encodeURIComponent(userEmail)}` }),
  });

  if (!response.ok) {
    const raw = await response.text().catch(() => '');
    let parsedMessage: string | null = null;

    try {
      const parsed = JSON.parse(raw);
      parsedMessage = parsed?.error?.message as string | undefined;
    } catch (error) {
      parsedMessage = null;
    }

    const scopedMessage =
      response.status === 403 && (raw.includes('ACCESS_TOKEN_SCOPE_INSUFFICIENT') || parsedMessage?.includes('scope'))
        ? 'Tu sesión de Google no tiene permisos de Google Chat. Vuelve a iniciar sesión aceptando los permisos de Chat.'
        : undefined;

    throw new ChatServiceError(
      scopedMessage ||
        `No se pudo abrir el chat directo con ${userEmail}. ${(parsedMessage || raw || response.statusText).trim()}`,
      response.status,
    );
  }

  const data = await response.json();
  const spaceName = (data?.name as string | undefined) || (data?.space?.name as string | undefined);

  if (!spaceName) {
    throw new ChatServiceError('La API de Chat no devolvió el identificador del espacio directo.', 502);
  }

  return normalizeSpaceName(spaceName) as string;
}

export async function sendChatMessageViaApi({ accessToken, space, text, threadName }: ChatApiMessageInput) {
  const normalizedSpace = normalizeSpaceName(space);
  const response = await fetch(`https://chat.googleapis.com/v1/${normalizedSpace}/messages`, {
    method: 'POST',
    headers: getBaseApiHeaders(accessToken),
    body: JSON.stringify({ text, thread: threadName ? { name: threadName } : undefined }),
  });

  if (!response.ok) {
    const errorText = await response.text().catch(() => '');
    const scopedMessage =
      response.status === 403 && errorText.includes('ACCESS_TOKEN_SCOPE_INSUFFICIENT')
        ? 'Tu sesión de Google no tiene permisos de Google Chat. Vuelve a iniciar sesión aceptando los permisos de Chat.'
        : undefined;
    throw new ChatServiceError(
      scopedMessage
        ? scopedMessage
        : `Error enviando mensaje por la API de Chat (${response.status}): ${(errorText || response.statusText).trim()}`,
      response.status,
    );
  }
}

export async function listChatMessages(accessToken: string, space: string, options?: { pageSize?: number }) {
  const { pageSize = 30 } = options || {};
  const normalizedSpace = normalizeSpaceName(space);
  const response = await fetch(
    `https://chat.googleapis.com/v1/${normalizedSpace}/messages?orderBy=createTime%20desc&pageSize=${pageSize}`,
    {
      headers: {
        ...getBaseApiHeaders(accessToken),
        'X-Goog-FieldMask':
          'messages.name,messages.text,messages.createTime,messages.thread.name,messages.sender.displayName,messages.sender.name',
      },
    },
  );

  if (!response.ok) {
    const errorText = await response.text().catch(() => '');
    const scopedMessage =
      response.status === 403 && errorText.includes('ACCESS_TOKEN_SCOPE_INSUFFICIENT')
        ? 'Faltan permisos de Google Chat para leer este espacio. Vuelve a iniciar sesión aceptando los scopes de Chat.'
        : undefined;
    throw new ChatServiceError(
      scopedMessage
        ? scopedMessage
        : `No se pudieron obtener los mensajes del espacio. ${(errorText || response.statusText).trim()}`,
      response.status,
    );
  }

  const data = await response.json();
  const messages = (data?.messages as ChatMessage[] | undefined) || [];
  // Devolver en orden cronológico ascendente para leer el hilo natural.
  return messages.reverse();
}
