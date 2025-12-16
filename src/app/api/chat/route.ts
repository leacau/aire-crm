import { NextResponse } from 'next/server';
import { listSpaceMessages, sendMessage } from '@/lib/googleChat';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function getSpaceFromConfig() {
  return process.env.GOOGLE_CHAT_SPACE_ID;
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const space = searchParams.get('space') || getSpaceFromConfig();

  if (!space) {
    return NextResponse.json(
      { error: 'Define GOOGLE_CHAT_SPACE_ID para leer las conversaciones del espacio mediante la API de Chat.' },
      { status: 400 },
    );
  }

  try {
    const messages = await listSpaceMessages(space, { pageSize: 50 });
    return NextResponse.json({ messages });
  } catch (error) {
    console.error('Error obteniendo mensajes de Google Chat', error);
    const message = error instanceof Error ? error.message : 'No se pudieron recuperar los mensajes.';
    return NextResponse.json({ error: message }, { status: 502 });
  }
}

export async function POST(request: Request) {
  const body = await request.json().catch(() => ({}));
  const text = typeof body.text === 'string' ? body.text.trim() : '';
  const threadName = typeof body.threadName === 'string' ? body.threadName.trim() : undefined;
  const space = typeof body.space === 'string' && body.space.trim() ? body.space.trim() : getSpaceFromConfig();

  if (!space) {
    return NextResponse.json(
      { error: 'Configura GOOGLE_CHAT_SPACE_ID para poder enviar mensajes a través de la API de Chat.' },
      { status: 400 },
    );
  }

  if (!text) {
    return NextResponse.json({ error: 'El mensaje es obligatorio.' }, { status: 400 });
  }

  try {
    const payload: Record<string, unknown> = { text };
    if (threadName) {
      payload.thread = { name: threadName };
    }

    await sendMessage(space, payload);
    return NextResponse.json({ ok: true, space, mode: 'api' });
  } catch (error) {
    console.error('Error enviando mensaje a Google Chat', error);
    const message = error instanceof Error ? error.message : 'No se pudo enviar el mensaje a Google Chat.';
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
