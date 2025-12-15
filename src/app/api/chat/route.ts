import { NextResponse } from 'next/server';
import { sendChatMessage } from '@/lib/google-chat-service';

export async function POST(request: Request) {
  const body = await request.json().catch(() => ({}));
  const text = typeof body.text === 'string' ? body.text.trim() : '';
  const threadKey = typeof body.threadKey === 'string' ? body.threadKey.trim() : undefined;

  if (!text) {
    return NextResponse.json({ error: 'El mensaje es obligatorio.' }, { status: 400 });
  }

  try {
    await sendChatMessage({ text, threadKey });
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error('Error enviando mensaje a Google Chat', error);
    return NextResponse.json({ error: 'No se pudo enviar el mensaje a Google Chat.' }, { status: 500 });
  }
}
