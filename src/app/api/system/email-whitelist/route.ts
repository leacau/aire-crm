import { NextResponse } from 'next/server';
import { dbAdmin } from '@/lib/firebase-admin';
import { isServerResponse, requireServerManagement } from '@/lib/server/auth';
import { logServerActivity } from '@/lib/server/activity';
import { systemErrorResponse } from '@/app/api/system/errors';

const EMAIL_WHITELIST_DOC_ID = 'email_whitelist';

export async function GET(request: Request) {
  const requester = await requireServerManagement(request);
  if (isServerResponse(requester)) return requester;

  try {
    const snap = await dbAdmin.collection('system_config').doc(EMAIL_WHITELIST_DOC_ID).get();
    const emails = snap.exists ? snap.data()?.emails : [];

    return NextResponse.json({ emails: Array.isArray(emails) ? emails : [] });
  } catch (error) {
    return systemErrorResponse(error, {
      action: 'EMAIL WHITELIST LIST',
      requesterId: requester.uid,
      publicError: 'No se pudo cargar la lista blanca de accesos.',
    });
  }
}

export async function PUT(request: Request) {
  const requester = await requireServerManagement(request);
  if (isServerResponse(requester)) return requester;

  try {
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
  } catch (error) {
    return systemErrorResponse(error, {
      action: 'EMAIL WHITELIST SAVE',
      requesterId: requester.uid,
      publicError: 'No se pudo guardar la lista blanca de accesos.',
    });
  }
}
