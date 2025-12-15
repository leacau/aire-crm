'use server';

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
