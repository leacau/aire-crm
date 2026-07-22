import { NextResponse } from 'next/server';
import { dbAdmin } from '@/lib/firebase-admin';
import { getRequesterName } from '@/app/api/clients/utils';
import { cleanCanjeUpdatePayload, mapCanje } from '@/app/api/canjes/utils';
import { isServerResponse, requireServerUser } from '@/lib/server/auth';
import { logServerActivity } from '@/lib/server/activity';
import type { Canje } from '@/lib/types';

type RouteContext = {
  params: Promise<{ canjeId: string }>;
};

export async function PATCH(request: Request, context: RouteContext) {
  const requester = await requireServerUser(request);
  if (isServerResponse(requester)) return requester;

  try {
    const { canjeId } = await context.params;
    const body = await request.json();
    const data = (body?.data || {}) as Partial<Omit<Canje, 'id'>>;
    const deleteKeys = Array.isArray(body?.deleteKeys)
      ? body.deleteKeys.filter((key: unknown) => typeof key === 'string')
      : [];
    const docRef = dbAdmin.collection('canjes').doc(canjeId);
    const originalDoc = await docRef.get();

    if (!originalDoc.exists) {
      return NextResponse.json({ error: 'Canje not found' }, { status: 404 });
    }

    const originalData = mapCanje(originalDoc.id, originalDoc.data());
    const requesterName = getRequesterName(requester);
    const updateData = cleanCanjeUpdatePayload(data as Record<string, unknown>, deleteKeys);

    if (data.tipo === 'Una vez' && data.estado === 'Aprobado' && originalData.estado !== 'Aprobado') {
      updateData.culminadoPorId = requester.uid;
      updateData.culminadoPorName = requesterName;
    }

    await docRef.update(updateData);

    let details = `actualizo el canje <strong>${originalData.titulo}</strong>`;
    if (data.estado && data.estado !== originalData.estado) {
      details = `cambio el estado del canje <strong>${originalData.titulo}</strong> a <strong>${data.estado}</strong>`;
    }
    if (data.clienteId && data.clienteId !== originalData.clienteId) {
      details = `asigno el canje <strong>${originalData.titulo}</strong> al cliente <strong>${data.clienteName}</strong>`;
    }
    if (data.historialMensual) {
      details = `actualizo el historial mensual del canje <strong>${originalData.titulo}</strong>`;
    }

    await logServerActivity({
      userId: requester.uid,
      userName: requesterName,
      type: 'update',
      entityType: 'canje' as any,
      entityId: canjeId,
      entityName: originalData.titulo,
      details,
      ownerName: data.asesorName || originalData.asesorName,
    });

    return NextResponse.json({ ok: true });
  } catch (error: any) {
    console.error('CANJE UPDATE ERROR:', {
      requester: requester.uid,
      code: error?.code,
      message: error?.message,
    });
    return NextResponse.json({
      error: 'No se pudo actualizar el canje.',
      details: error?.message || 'Error desconocido',
    }, { status: 502 });
  }
}

export async function DELETE(request: Request, context: RouteContext) {
  const requester = await requireServerUser(request);
  if (isServerResponse(requester)) return requester;

  try {
    const { canjeId } = await context.params;
    const docRef = dbAdmin.collection('canjes').doc(canjeId);
    const canjeSnap = await docRef.get();

    if (!canjeSnap.exists) {
      return NextResponse.json({ error: 'Canje not found' }, { status: 404 });
    }

    const canjeData = mapCanje(canjeSnap.id, canjeSnap.data());
    await docRef.delete();

    const requesterName = getRequesterName(requester);
    await logServerActivity({
      userId: requester.uid,
      userName: requesterName,
      type: 'delete',
      entityType: 'canje' as any,
      entityId: canjeId,
      entityName: canjeData.titulo,
      details: `elimino el canje <strong>${canjeData.titulo}</strong>`,
      ownerName: canjeData.asesorName || requesterName,
    });

    return NextResponse.json({ ok: true });
  } catch (error: any) {
    console.error('CANJE DELETE ERROR:', {
      requester: requester.uid,
      code: error?.code,
      message: error?.message,
    });
    return NextResponse.json({
      error: 'No se pudo eliminar el canje.',
      details: error?.message || 'Error desconocido',
    }, { status: 502 });
  }
}
