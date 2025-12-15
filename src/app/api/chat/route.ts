import { NextResponse } from 'next/server';
import { sendChatMessage } from '@/lib/google-chat-service';

export async function POST(request: Request) {
  const body = await request.json().catch(() => ({}));
  const text = typeof body.text === 'string' ? body.text.trim() : '';
  const threadKey = typeof body.threadKey === 'string' ? body.threadKey.trim() : undefined;
  const webhookUrlRaw = typeof body.webhookUrl === 'string' ? body.webhookUrl.trim() : '';

  const webhookUrl = webhookUrlRaw ? new URL(webhookUrlRaw) : undefined;

  if (webhookUrl && webhookUrl.protocol !== 'https:') {
    return NextResponse.json({ error: 'El webhook debe ser una URL https válida.' }, { status: 400 });
  }

  if (!text) {
    return NextResponse.json({ error: 'El mensaje es obligatorio.' }, { status: 400 });
  }

  const resolvedWebhook = webhookUrl?.toString() ?? process.env.GOOGLE_CHAT_WEBHOOK_URL;

  if (!resolvedWebhook) {
    return NextResponse.json(
      { error: 'Configura GOOGLE_CHAT_WEBHOOK_URL o proporciona un webhook alternativo para enviar el mensaje.' },
      { status: 400 },
    );
  }

  try {
    await sendChatMessage({ text, threadKey, webhookUrl: resolvedWebhook });
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error('Error enviando mensaje a Google Chat', error);
    return NextResponse.json({ error: 'No se pudo enviar el mensaje a Google Chat.' }, { status: 500 });
  }
}
