import { NextResponse } from 'next/server';
import { dbAdmin } from '@/lib/firebase-admin';
import { isServerResponse, requireServerManagement } from '@/lib/server/auth';
import { logServerActivity } from '@/lib/server/activity';

const EMAIL_WHITELIST_DOC_ID = 'email_whitelist';

export async function GET(request: Request) {
  const requester = await requireServerManagement(request);
  if (isServerResponse(requester)) return requester;

  const snap = await dbAdmin.collection('system_config').doc(EMAIL_WHITELIST_DOC_ID).get();
  const emails = snap.exists ? snap.data()?.emails : [];

  return NextResponse.json({ emails: Array.isArray(emails) ? emails : [] });
}

export async function PUT(request: Request) {
  const requester = await requireServerManagement(request);
  if (isServerResponse(requester)) return requester;

  const body = await request.json();
  const emails = Array.isArray(body?.emails)
    ? body.emails.map((email: unknown) => String(email).trim().toLowerCase()).filter(Boolean)
    : [];

  await dbAdmin.collection('system_config').doc(EMAIL_WHITELIST_DOC_ID).set({ emails }, { merge: true });

  await logServerActivity({
    userId: requester.uid,
    userName: requester.name || requester.email || 'Usuario',
    type: 'update',
    entityType: 'system_config' as any,
    entityId: EMAIL_WHITELIST_DOC_ID,
    entityName: 'Lista Blanca de Accesos',
    details: 'actualizo los correos autorizados para ingresar al sistema.',
    ownerName: 'Sistema',
  });

  return NextResponse.json({ emails });
}

