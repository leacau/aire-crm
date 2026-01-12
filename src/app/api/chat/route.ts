import { NextResponse } from 'next/server';
import {
  ChatServiceError,
  findDirectMessageSpace,
  getSpaceFromWebhook,
  listChatMessages,
  listSpaceMembers,
  sendChatMessage,
  sendChatMessageViaApi,
} from '@/lib/google-chat-service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function getSpaceFromConfig() {
  return process.env.GOOGLE_CHAT_SPACE_ID || getSpaceFromWebhook(process.env.GOOGLE_CHAT_WEBHOOK_URL);
}

function extractAccessToken(request: Request) {
  const authHeader = request.headers.get('authorization');
  if (!authHeader) return null;
  const [scheme, token] = authHeader.split(' ');
  if (scheme?.toLowerCase() !== 'bearer') return null;
  return token || null;
}

export async function GET(request: Request) {
  const accessToken = extractAccessToken(request);
  if (!accessToken) {
    return NextResponse.json({ error: 'Falta el token de acceso de Google para leer el espacio.' }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const space = searchParams.get('space') || getSpaceFromConfig();
  const mode = searchParams.get('mode') || 'messages';

  if (!space) {
    return NextResponse.json(
      { error: 'Define GOOGLE_CHAT_SPACE_ID o usa un webhook que incluya el espacio para leer las conversaciones.' },
      { status: 400 },
    );
  }

  try {
    if (mode === 'members') {
      const members = await listSpaceMembers(accessToken, space);
      return NextResponse.json({ members });
    }

    const messages = await listChatMessages(accessToken, space, { pageSize: 50 });
    return NextResponse.json({ messages });
  } catch (error) {
    console.error('Error obteniendo datos de Google Chat', error);
    const message = error instanceof Error ? error.message : 'No se pudieron recuperar los datos.';
    const status = error instanceof ChatServiceError && error.status ? error.status : 502;
    return NextResponse.json({ error: message }, { status });
  }
}

export async function POST(request: Request) {
  const body = await request.json().catch(() => ({}));
  const text = typeof body.text === 'string' ? body.text.trim() : '';
  const threadKey = typeof body.threadKey === 'string' ? body.threadKey.trim() : undefined;
  const webhookUrlRaw = typeof body.webhookUrl === 'string' ? body.webhookUrl.trim() : '';
  const targetEmail = typeof body.targetEmail === 'string' ? body.targetEmail.trim() : '';
  const targetSpace = typeof body.targetSpace === 'string' ? body.targetSpace.trim() : '';
  const forceApi = body?.mode === 'api';

  const accessToken = extractAccessToken(request) || (typeof body.accessToken === 'string' ? body.accessToken.trim() : '');

  const webhookUrl = webhookUrlRaw ? new URL(webhookUrlRaw) : undefined;

  if (webhookUrl && webhookUrl.protocol !== 'https:') {
    return NextResponse.json({ error: 'El webhook debe ser una URL https válida.' }, { status: 400 });
  }

  if (!text) {
    return NextResponse.json({ error: 'El mensaje es obligatorio.' }, { status: 400 });
  }

  try {
    // Preferir la API autenticada si hay token o si se requiere un mensaje directo.
    if (forceApi || accessToken || targetEmail || targetSpace) {
      const baseSpace = getSpaceFromConfig();
      if (!accessToken) {
        return NextResponse.json({ error: 'Falta token de Google para enviar por la API de Chat.' }, { status: 401 });
      }

      const space = targetSpace
        ? targetSpace
        : targetEmail
          ? await findDirectMessageSpace(accessToken, targetEmail)
          : baseSpace;

      if (!space) {
        return NextResponse.json(
          { error: 'Define GOOGLE_CHAT_SPACE_ID para usar la API de Chat o envía un webhook alternativo.' },
          { status: 400 },
        );
      }

      await sendChatMessageViaApi({ accessToken, space, text, threadName: threadKey });
      return NextResponse.json({ ok: true, space, mode: 'api' });
    }

    const resolvedWebhook = webhookUrl?.toString() ?? process.env.GOOGLE_CHAT_WEBHOOK_URL;

    if (!resolvedWebhook) {
      return NextResponse.json(
        { error: 'Configura GOOGLE_CHAT_WEBHOOK_URL o proporciona un webhook alternativo para enviar el mensaje.' },
        { status: 400 },
      );
    }

    try {
      const parsed = new URL(resolvedWebhook);
      if (parsed.protocol !== 'https:') {
        return NextResponse.json({ error: 'El webhook debe usar https.' }, { status: 400 });
      }
    } catch (error) {
      return NextResponse.json(
        {
          error: 'El webhook configurado no es una URL válida. Verifica la variable GOOGLE_CHAT_WEBHOOK_URL o el valor enviado.',
        },
        { status: 400 },
      );
    }

    await sendChatMessage({ text, threadKey, webhookUrl: resolvedWebhook });
    return NextResponse.json({ ok: true, mode: 'webhook' });
  } catch (error) {
    console.error('Error enviando mensaje a Google Chat', error);
    const message = error instanceof Error ? error.message : 'No se pudo enviar el mensaje a Google Chat.';
    if (error instanceof ChatServiceError) {
      return NextResponse.json({ error: message }, { status: error.status ?? 502 });
    }
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
