import { NextResponse } from 'next/server';
import {
  ChatServiceError,
  getSpaceFromWebhook,
  listChatMessages,
  listSpaceMembers,
} from '@/lib/google-chat-service';
// Importamos las nuevas funciones de autenticación por servidor (Service Account)
import { sendServerMessage, findDMParent } from '@/lib/server/google-chat-auth';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// --- Helpers para GET (Lectura con contexto de usuario) ---

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

// --- GET: Mantenemos la lógica de leer como Usuario ---
// Esto es útil para que el frontend muestre lo que el usuario tiene permiso de ver.
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

// --- POST: Nueva lógica de envío usando Service Account (Bot) ---
// Ya no depende del token del usuario, asegurando que las alertas lleguen siempre.
export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => ({}));
    const { text, targetEmail, targetSpace, threadKey } = body;

    if (!text) {
      return NextResponse.json({ error: 'El mensaje es obligatorio.' }, { status: 400 });
    }

    // Determinar el espacio de destino
    let finalSpace = targetSpace || process.env.GOOGLE_CHAT_SPACE_ID;

    // Caso: Mensaje Directo (DM) a un usuario específico
    if (targetEmail) {
      // Usamos la cuenta de servicio para encontrar el chat privado con el usuario
      const dmSpace = await findDMParent(targetEmail);
      if (!dmSpace) {
        return NextResponse.json(
          { error: `No se pudo encontrar o iniciar un chat directo con ${targetEmail}. Asegúrate de haber iniciado una conversación con el Bot previamente.` },
          { status: 404 }
        );
      }
      finalSpace = dmSpace;
    }

    if (!finalSpace) {
      return NextResponse.json(
        { error: 'No se especificó un espacio (targetSpace) ni un destinatario (targetEmail), y no hay configuración por defecto.' },
        { status: 400 }
      );
    }

    // Enviar el mensaje usando la identidad del Servidor (Bot)
    const result = await sendServerMessage(finalSpace, text, threadKey);

    return NextResponse.json({ ok: true, data: result, mode: 'service-account' });

  } catch (error: any) {
    console.error('API Chat Error (Service Account):', error);
    return NextResponse.json(
      { error: error.message || 'Error interno enviando notificación.' },
      { status: 500 }
    );
  }
}
