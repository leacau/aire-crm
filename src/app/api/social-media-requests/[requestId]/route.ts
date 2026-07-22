import { NextResponse } from 'next/server';
import { FieldValue } from 'firebase-admin/firestore';
import { dbAdmin } from '@/lib/firebase-admin';
import { getRequesterName } from '@/app/api/clients/utils';
import { hasServerManagementPrivileges, isServerResponse, requireServerUser } from '@/lib/server/auth';
import { logServerActivity } from '@/lib/server/activity';
import { buildSocialMediaUpdatePayload, mapSocialMediaRequest } from '@/app/api/social-media-requests/utils';
import {
  canAccessAdvisorScopedRecord,
  canAssignAdvisorScopedOwner,
  changesAdvisorScopedOwner,
} from '@/lib/server/advisor-scoped-access';
import type { SocialMediaRequest } from '@/lib/types';

type RouteContext = {
  params: Promise<{ requestId: string }>;
};

export async function GET(request: Request, context: RouteContext) {
  const requester = await requireServerUser(request);
  if (isServerResponse(requester)) return requester;

  try {
    const { requestId } = await context.params;
    const snap = await dbAdmin.collection('social_media_requests').doc(requestId).get();
    if (!snap.exists) {
      return NextResponse.json({ request: null });
    }

    const requestData = mapSocialMediaRequest(snap.id, snap.data());
    if (!(await canAccessAdvisorScopedRecord(requestData, requester))) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    return NextResponse.json({
      request: requestData,
    });
  } catch (error: any) {
    console.error('SOCIAL MEDIA REQUEST DETAIL ERROR:', {
      requester: requester.uid,
      code: error?.code,
      message: error?.message,
    });
    return NextResponse.json({
      error: 'No se pudo cargar el pedido de redes.',
      details: error?.message || 'Error desconocido',
    }, { status: 502 });
  }
}

export async function PATCH(request: Request, context: RouteContext) {
  const requester = await requireServerUser(request);
  if (isServerResponse(requester)) return requester;

  try {
    const { requestId } = await context.params;
    const body = await request.json();
    const data = (body?.data || {}) as Partial<Omit<SocialMediaRequest, 'id' | 'createdAt'>>;
    const docRef = dbAdmin.collection('social_media_requests').doc(requestId);
    const snap = await docRef.get();

    if (!snap.exists) {
      return NextResponse.json({ error: 'Pedido no encontrado' }, { status: 404 });
    }

    const originalData = mapSocialMediaRequest(snap.id, snap.data());
    if (!(await canAccessAdvisorScopedRecord(originalData, requester))) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    if (!canAssignAdvisorScopedOwner(requester) && changesAdvisorScopedOwner(data, originalData)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const updateData = buildSocialMediaUpdatePayload(data as Record<string, unknown>);

    if (Array.isArray(data.approvalHistory)) {
      delete updateData.approvalHistory;
      if (data.approvalHistory.length > 0) {
        updateData.approvalHistory = FieldValue.arrayUnion(...data.approvalHistory);
      }
    }

    await docRef.update(updateData);

    const requesterName = getRequesterName(requester);
    await logServerActivity({
      userId: requester.uid,
      userName: requesterName,
      type: 'update',
      entityType: 'social_media_request' as any,
      entityId: requestId,
      entityName: data.clientName || originalData.clientName,
      details: `actualizo un pedido de redes de <strong>${data.clientName || originalData.clientName}</strong>`,
      ownerName: data.advisorName || originalData.advisorName,
    });

    return NextResponse.json({ ok: true });
  } catch (error: any) {
    console.error('SOCIAL MEDIA REQUEST UPDATE ERROR:', {
      requester: requester.uid,
      code: error?.code,
      message: error?.message,
    });
    return NextResponse.json({
      error: 'No se pudo actualizar el pedido de redes.',
      details: error?.message || 'Error desconocido',
    }, { status: 502 });
  }
}

export async function DELETE(request: Request, context: RouteContext) {
  const requester = await requireServerUser(request);
  if (isServerResponse(requester)) return requester;

  try {
    const { requestId } = await context.params;
    const docRef = dbAdmin.collection('social_media_requests').doc(requestId);
    const snap = await docRef.get();

    if (!snap.exists) {
      return NextResponse.json({ ok: true });
    }

    if (!hasServerManagementPrivileges(requester)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const data = snap.data() || {};
    await docRef.delete();

    const requesterName = getRequesterName(requester);
    await logServerActivity({
      userId: requester.uid,
      userName: requesterName,
      type: 'delete',
      entityType: 'social_media_request' as any,
      entityId: requestId,
      entityName: data.clientName || 'Pedido de redes',
      details: `elimino un pedido de redes de <strong>${data.clientName || 'Cliente'}</strong>`,
      ownerName: data.advisorName || requesterName,
    });

    return NextResponse.json({ ok: true });
  } catch (error: any) {
    console.error('SOCIAL MEDIA REQUEST DELETE ERROR:', {
      requester: requester.uid,
      code: error?.code,
      message: error?.message,
    });
    return NextResponse.json({
      error: 'No se pudo eliminar el pedido de redes.',
      details: error?.message || 'Error desconocido',
    }, { status: 502 });
  }
}
