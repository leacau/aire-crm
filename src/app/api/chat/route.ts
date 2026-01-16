import { NextResponse } from 'next/server';
import {
  ChatServiceError,
  getSpaceFromWebhook,
  listChatMessages,
  listSpaceMembers,
  sendChatMessageViaApi, // Importamos la función para enviar como usuario
} from '@/lib/google-chat-service';
import { sendServerMessage, findDMParent } from '@/lib/server/google-chat-auth';

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

// --- GET: Leer mensajes ---
export async function GET(request: Request) {
  const accessToken = extractAccessToken(request);
  if (!accessToken) {
    return NextResponse.json({ error: 'Falta el token de acceso de Google.' }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const space = searchParams.get('space') || getSpaceFromConfig();
  const mode = searchParams.get('mode') || 'messages';

  if (!space) {
    return NextResponse.json(
      { error: 'No se especificó un espacio de chat.' },
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
    console.error('Error Google Chat GET:', error);
    const status = error instanceof ChatServiceError && error.status ? error.status : 500;
    const message = error instanceof Error ? error.message : 'Error desconocido';
    return NextResponse.json({ error: message }, { status });
  }
}

// --- POST: Enviar mensajes (Híbrido: Usuario o Bot) ---
export async function POST(request: Request) {
  try {
    const accessToken = extractAccessToken(request);
    const body = await request.json().catch(() => ({}));
    const { text, targetEmail, targetSpace, threadKey, mode } = body;

    if (!text) {
      return NextResponse.json({ error: 'El mensaje es obligatorio.' }, { status: 400 });
    }

    let finalSpace = targetSpace || process.env.GOOGLE_CHAT_SPACE_ID;

    // 1. MODO USUARIO (Prioridad si hay token y es la página de Chat)
    // Si viene desde la UI de Chat, queremos enviar como "Yo" (Usuario)
    if (accessToken && mode === 'api') {
        if (!finalSpace) {
             return NextResponse.json({ error: 'Se requiere un espacio destino.' }, { status: 400 });
        }
        
        await sendChatMessageViaApi({
            accessToken,
            space: finalSpace,
            text,
            threadName: threadKey
        });
        
        return NextResponse.json({ ok: true, mode: 'user' });
    }

    // 2. MODO BOT / SERVER (Fallback para notificaciones automáticas)
    // Si no hay token de usuario, usamos la Service Account
    
    // Intentar resolver DM si es necesario
    if (targetEmail) {
      const dmSpace = await findDMParent(targetEmail);
      if (dmSpace) {
        finalSpace = dmSpace;
      } else {
         console.warn(`No se pudo iniciar DM con ${targetEmail}, intentando espacio por defecto.`);
      }
    }

    if (!finalSpace) {
      return NextResponse.json(
        { error: 'No se pudo determinar el espacio de destino para el Bot.' },
        { status: 400 }
      );
    }

    const result = await sendServerMessage(finalSpace, text, threadKey);
    return NextResponse.json({ ok: true, data: result, mode: 'service-account' });

  } catch (error: any) {
    console.error('API Chat POST Error:', error);
    const status = error.status || 500;
    return NextResponse.json(
      { error: error.message || 'Error interno enviando mensaje.' },
      { status }
    );
  }
}
