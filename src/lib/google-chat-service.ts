'use server';

type ChatMessageInput = {
  text: string;
  threadKey?: string;
  webhookUrl?: string;
};

export async function sendChatMessage({ text, threadKey, webhookUrl }: ChatMessageInput) {
  const targetUrl = webhookUrl || process.env.GOOGLE_CHAT_WEBHOOK_URL;

  if (!targetUrl) {
    throw new Error('GOOGLE_CHAT_WEBHOOK_URL no está configurado.');
  }

  const url = new URL(targetUrl);
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
    throw new Error(`Error de Google Chat: ${response.status} ${response.statusText} ${errorText}`.trim());
  }
}
