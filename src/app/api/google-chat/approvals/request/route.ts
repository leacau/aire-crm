import { NextResponse } from 'next/server';
import { getSpaceNameByKey, saveApprovalRequest, sendMessage } from '@/lib/googleChat';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function validateApiKey(headers: Headers) {
  const configuredKey = process.env.INTERNAL_API_KEY;
  if (!configuredKey) {
    throw new Error('Configura INTERNAL_API_KEY para proteger este endpoint.');
  }

  const provided = headers.get('x-internal-api-key');
  return provided && provided === configuredKey;
}

function buildApprovalCard(body: any) {
  const { requestId, title, description, amount, requestedByEmail, approveUrl } = body as Record<string, any>;

  const widgets: any[] = [
    description ? { textParagraph: { text: description } } : null,
    { decoratedText: { topLabel: 'Request ID', text: requestId } },
    amount !== undefined && amount !== null
      ? { decoratedText: { topLabel: 'Monto', text: String(amount) } }
      : null,
    { decoratedText: { topLabel: 'Solicitado por', text: requestedByEmail } },
  ].filter(Boolean);

  return {
    fallbackText: `Nueva solicitud de aprobación: ${title}`,
    text: `Nueva solicitud de aprobación: ${title}`,
    cardsV2: [
      {
        cardId: `approval-${requestId}`,
        card: {
          header: {
            title,
            subtitle: 'Solicitud de aprobación',
          },
          sections: [
            {
              header: 'Detalle',
              widgets,
            },
            {
              widgets: [
                {
                  buttonList: {
                    buttons: [
                      {
                        text: '✅ Aprobar',
                        onClick: {
                          action: {
                            function: 'handleApproval',
                            parameters: [
                              { key: 'requestId', value: requestId },
                              { key: 'decision', value: 'approve' },
                            ],
                          },
                        },
                      },
                      {
                        text: '❌ Rechazar',
                        onClick: {
                          action: {
                            function: 'handleApproval',
                            parameters: [
                              { key: 'requestId', value: requestId },
                              { key: 'decision', value: 'reject' },
                            ],
                          },
                        },
                      },
                      approveUrl
                        ? {
                            text: '🔗 Ver en CRM',
                            onClick: {
                              openLink: { url: approveUrl },
                            },
                          }
                        : null,
                    ].filter(Boolean),
                  },
                },
              ],
            },
          ],
        },
      },
    ],
  };
}

export async function POST(request: Request) {
  try {
    if (!validateApiKey(request.headers)) {
      return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
    }
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message }, { status: 500 });
  }

  const body = await request.json().catch(() => ({}));
  const { requestId, title, description, amount, requestedByEmail } = body || {};

  if (!requestId || !title || !requestedByEmail) {
    return NextResponse.json(
      { error: 'requestId, title y requestedByEmail son obligatorios.' },
      { status: 400 },
    );
  }

  try {
    const spaceName = await getSpaceNameByKey('approvals');
    if (!spaceName) {
      return NextResponse.json(
        { error: 'No se encontró el espacio "approvals" en la colección chatSpaces.' },
        { status: 404 },
      );
    }

    const message = buildApprovalCard({ requestId, title, description, amount, requestedByEmail });
    const sentMessage = await sendMessage(spaceName, message);

    await saveApprovalRequest({
      requestId,
      title,
      description,
      amount,
      requestedByEmail,
      lastMessage: { spaceName, messageName: sentMessage.name, threadName: sentMessage.thread?.name ?? null },
    });

    return NextResponse.json({ ok: true, messageName: sentMessage.name, spaceName });
  } catch (error) {
    console.error('Error en solicitud de aprobación', error);
    return NextResponse.json({ error: (error as Error).message }, { status: 500 });
  }
}
