import { NextResponse } from 'next/server';
import {
  ChatActionParameter,
  ChatEvent,
  getApprovalRequest,
  registerDmSpace,
  replyInThread,
  sendDmToEmail,
  sendMessage,
  updateApprovalDecision,
  updateMessage,
} from '@/lib/googleChat';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function getParameterValue(parameters: ChatActionParameter[] | undefined, key: string) {
  return parameters?.find((p) => p.key === key)?.value;
}

function buildDecisionText(decision: 'approve' | 'reject', actor: string) {
  const verb = decision === 'approve' ? 'Aprobado' : 'Rechazado';
  return `${verb} por ${actor} a las ${new Date().toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' })}`;
}

async function handleApprovalAction(event: ChatEvent) {
  const parameters = event.action?.parameters ?? [];
  const decisionParam = getParameterValue(parameters, 'decision');
  const requestId = getParameterValue(parameters, 'requestId');

  if (!requestId || !decisionParam || !['approve', 'reject'].includes(decisionParam)) {
    return NextResponse.json({ error: 'Payload inválido' }, { status: 400 });
  }

  const actor = event.user?.email || event.user?.name || 'Usuario';
  const decision = decisionParam === 'approve' ? 'APPROVED' : 'REJECTED';

  await updateApprovalDecision({ requestId, status: decision, decidedBy: actor });

  const stored = await getApprovalRequest(requestId);
  const decisionText = buildDecisionText(decisionParam as 'approve' | 'reject', actor);

  if (stored?.lastMessage?.messageName) {
    try {
      await updateMessage(stored.lastMessage.messageName as string, { text: decisionText });
    } catch (error) {
      if (stored.lastMessage.threadName && stored.lastMessage.spaceName) {
        await replyInThread(stored.lastMessage.spaceName as string, stored.lastMessage.threadName as string, decisionText);
      }
      console.warn('Fallo actualizando mensaje, se envió reply en thread.', error);
    }
  }

  if (stored?.requestedByEmail) {
    await sendDmToEmail(stored.requestedByEmail as string, `Solicitud ${requestId}: ${decisionText}`);
  }

  return NextResponse.json({ ok: true });
}

async function handleStart(event: ChatEvent) {
  const email = event.user?.email;
  const spaceName = event.space?.name || event.message?.space?.name;

  if (!email || !spaceName) {
    return NextResponse.json(
      {
        text: 'Necesito tu email para registrar el DM. Pide al admin que habilite el email en el payload.',
      },
      { status: 200 },
    );
  }

  await registerDmSpace(email, spaceName);
  await sendMessage(spaceName, { text: '✅ Activado. A partir de ahora recibirás notificaciones del CRM aquí.' });

  return NextResponse.json({ ok: true });
}

export async function POST(request: Request) {
  const event = (await request.json().catch(() => ({}))) as ChatEvent;

  if (event.type === 'CARD_CLICKED' || event.action?.actionMethodName === 'handleApproval') {
    return handleApprovalAction(event);
  }

  const incomingText = event.message?.text?.trim().toLowerCase() || event.argumentText?.trim().toLowerCase();
  if (incomingText === 'start' || incomingText === '/start') {
    return handleStart(event);
  }

  return NextResponse.json({ ok: true });
}
