import { NextResponse } from 'next/server';
import { dbAdmin } from '@/lib/firebase-admin';
import {
  hasServerManagementPrivileges,
  isServerResponse,
  requireServerManagement,
  requireServerUser,
} from '@/lib/server/auth';
import { logServerActivity } from '@/lib/server/activity';
import { toTitleCase } from '@/lib/utils';
import { clientErrorResponse } from '@/app/api/clients/errors';
import { cleanObject, FieldValue, getRequesterName, mapClient } from '@/app/api/clients/utils';
import type { Client } from '@/lib/types';
import type { ClientTangoIdField, ClientTangoSyncedField, ClientTangoUpdate } from '@/lib/api/clients';

type RouteContext = {
  params: Promise<{ clientId: string }>;
};

const TANGO_ID_FIELDS = new Set<ClientTangoIdField>(['idAire', 'idAireSrl', 'idAireDigital']);
const TANGO_SYNCED_FIELDS = new Set<ClientTangoSyncedField>([
  'isTangoSyncedAire',
  'isTangoSyncedSrl',
  'isTangoSyncedSas',
]);
const TANGO_ADMIN_UPDATE_FIELDS = new Set<keyof ClientTangoUpdate>([
  'tangoCompanyId',
  'idTango',
  'razonSocialTango',
  'idAireSrl',
  'idAireDigital',
  'idAire',
]);

function isTangoSyncedField(value: unknown): value is ClientTangoSyncedField {
  return typeof value === 'string' && TANGO_SYNCED_FIELDS.has(value as ClientTangoSyncedField);
}

function isTangoIdField(value: unknown): value is ClientTangoIdField {
  return typeof value === 'string' && TANGO_ID_FIELDS.has(value as ClientTangoIdField);
}

function buildTangoUpdatePayload(data: ClientTangoUpdate) {
  const updatePayload: Record<string, unknown> = {
    updatedAt: FieldValue.serverTimestamp(),
  };

  if (data.cuit?.trim()) updatePayload.cuit = data.cuit.trim();
  if (data.razonSocialTango?.trim()) updatePayload.razonSocialTango = toTitleCase(data.razonSocialTango.trim());
  if (data.tangoCompanyId?.toString().trim()) {
    updatePayload.tangoCompanyId = data.tangoCompanyId.toString().trim();
    updatePayload.idTango = updatePayload.tangoCompanyId;
  } else if (data.idTango?.toString().trim()) {
    updatePayload.idTango = data.idTango.toString().trim();
    updatePayload.tangoCompanyId = updatePayload.idTango;
  }
  if (data.email?.trim()) updatePayload.email = data.email.trim();
  if (data.phone?.trim()) updatePayload.phone = data.phone.trim();
  if (data.rubro?.trim()) updatePayload.rubro = data.rubro.trim();
  if (data.razonSocial?.trim()) updatePayload.razonSocial = toTitleCase(data.razonSocial.trim());
  if (data.denominacion?.trim()) updatePayload.denominacion = toTitleCase(data.denominacion.trim());
  if (data.idAireSrl?.toString().trim()) updatePayload.idAireSrl = data.idAireSrl.toString().trim();
  if (data.idAireDigital?.toString().trim()) updatePayload.idAireDigital = data.idAireDigital.toString().trim();
  if (data.idAire?.toString().trim()) updatePayload.idAire = data.idAire.toString().trim();
  if (data.condicionIVA?.trim()) updatePayload.condicionIVA = data.condicionIVA.trim();
  if (data.provincia?.trim()) updatePayload.provincia = data.provincia.trim();
  if (data.localidad?.trim()) updatePayload.localidad = data.localidad.trim();
  if (data.tipoEntidad?.trim()) updatePayload.tipoEntidad = data.tipoEntidad.trim();
  if (data.observaciones?.trim()) updatePayload.observaciones = data.observaciones.trim();

  return cleanObject(updatePayload);
}

function buildDetailText(updatePayload: Record<string, unknown>, originalData: Client) {
  const detailsParts: string[] = [];

  if (updatePayload.cuit && updatePayload.cuit !== originalData.cuit) detailsParts.push(`CUIT <strong>${updatePayload.cuit}</strong>`);
  if (updatePayload.tangoCompanyId && updatePayload.tangoCompanyId !== originalData.tangoCompanyId) detailsParts.push(`ID de Tango <strong>${updatePayload.tangoCompanyId}</strong>`);
  if (updatePayload.email && updatePayload.email !== originalData.email) detailsParts.push(`Email <strong>${updatePayload.email}</strong>`);
  if (updatePayload.phone && updatePayload.phone !== originalData.phone) detailsParts.push(`Telefono <strong>${updatePayload.phone}</strong>`);
  if (updatePayload.rubro && updatePayload.rubro !== originalData.rubro) detailsParts.push(`Rubro <strong>${updatePayload.rubro}</strong>`);
  if (updatePayload.razonSocial && updatePayload.razonSocial !== originalData.razonSocial) detailsParts.push(`Razon Social <strong>${updatePayload.razonSocial}</strong>`);
  if (updatePayload.denominacion && updatePayload.denominacion !== originalData.denominacion) detailsParts.push(`Denominacion <strong>${updatePayload.denominacion}</strong>`);
  if (updatePayload.idAireSrl && updatePayload.idAireSrl !== originalData.idAireSrl) detailsParts.push(`ID Aire SRL <strong>${updatePayload.idAireSrl}</strong>`);
  if (updatePayload.idAireDigital && updatePayload.idAireDigital !== originalData.idAireDigital) detailsParts.push(`ID Aire Digital <strong>${updatePayload.idAireDigital}</strong>`);
  if (updatePayload.idAire && updatePayload.idAire !== originalData.idAire) detailsParts.push(`ID Aire <strong>${updatePayload.idAire}</strong>`);
  if (updatePayload.condicionIVA && updatePayload.condicionIVA !== originalData.condicionIVA) detailsParts.push(`Condicion IVA <strong>${updatePayload.condicionIVA}</strong>`);
  if (updatePayload.provincia && updatePayload.provincia !== originalData.provincia) detailsParts.push(`Provincia <strong>${updatePayload.provincia}</strong>`);
  if (updatePayload.localidad && updatePayload.localidad !== originalData.localidad) detailsParts.push(`Localidad <strong>${updatePayload.localidad}</strong>`);
  if (updatePayload.tipoEntidad && updatePayload.tipoEntidad !== originalData.tipoEntidad) detailsParts.push(`Tipo de Entidad <strong>${updatePayload.tipoEntidad}</strong>`);
  if (updatePayload.observaciones && updatePayload.observaciones !== originalData.observaciones) detailsParts.push('Observaciones');

  return detailsParts.length > 0 ? detailsParts.join(' y ') : 'datos de Tango';
}

export async function PATCH(request: Request, context: RouteContext) {
  const requester = await requireServerUser(request);
  if (isServerResponse(requester)) return requester;

  try {
    const { clientId } = await context.params;
    const body = await request.json();
    const data = (body?.data || {}) as ClientTangoUpdate;
    const updatePayload = buildTangoUpdatePayload(data);
    const markSyncedField = body?.markSyncedField;
    const canManageTangoMapping = hasServerManagementPrivileges(requester);
    const hasAdminTangoUpdate = Object.keys(data).some(key => TANGO_ADMIN_UPDATE_FIELDS.has(key as keyof ClientTangoUpdate));

    if (markSyncedField !== undefined) {
      if (!isTangoSyncedField(markSyncedField)) {
        return NextResponse.json({ error: 'Campo de sincronizacion invalido.' }, { status: 400 });
      }
      updatePayload[markSyncedField] = true;
    }

    const docRef = dbAdmin.collection('clients').doc(clientId);
    const originalDoc = await docRef.get();

    if (!originalDoc.exists) {
      return NextResponse.json({ error: 'Client not found' }, { status: 404 });
    }

    const originalData = mapClient(originalDoc.id, originalDoc.data());
    if (!canManageTangoMapping && originalData.ownerId !== requester.uid) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    if (!canManageTangoMapping && (hasAdminTangoUpdate || markSyncedField !== undefined)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    await docRef.update(updatePayload);

    const requesterName = getRequesterName(requester);
    const detailText = buildDetailText(updatePayload, originalData);
    await logServerActivity({
      userId: requester.uid,
      userName: requesterName,
      type: 'update',
      entityType: 'client',
      entityId: clientId,
      entityName: originalData.denominacion,
      details: `actualizo ${detailText} para <a href="/clients/${clientId}" class="font-bold text-primary hover:underline">${originalData.denominacion}</a>`,
      ownerName: originalData.ownerName,
    });

    return NextResponse.json({ ok: true });
  } catch (error) {
    return clientErrorResponse(error, {
      action: 'TANGO MAPPING UPDATE',
      requesterId: requester.uid,
      publicError: 'No se pudo actualizar el mapeo Tango del cliente.',
    });
  }
}

export async function DELETE(request: Request, context: RouteContext) {
  const requester = await requireServerManagement(request);
  if (isServerResponse(requester)) return requester;

  try {
    const { clientId } = await context.params;
    const body = await request.json().catch(() => null);
    const crmIdField = body?.crmIdField;
    const syncedField = body?.syncedField;

    if (!isTangoIdField(crmIdField) || !isTangoSyncedField(syncedField)) {
      return NextResponse.json({ error: 'Campos de Tango invalidos.' }, { status: 400 });
    }

    const docRef = dbAdmin.collection('clients').doc(clientId);
    const originalDoc = await docRef.get();

    if (!originalDoc.exists) {
      return NextResponse.json({ error: 'Client not found' }, { status: 404 });
    }

    const originalData = mapClient(originalDoc.id, originalDoc.data());
    await docRef.update({
      [crmIdField]: FieldValue.delete(),
      [syncedField]: FieldValue.delete(),
      updatedAt: FieldValue.serverTimestamp(),
    });

    const requesterName = getRequesterName(requester);
    await logServerActivity({
      userId: requester.uid,
      userName: requesterName,
      type: 'update',
      entityType: 'client',
      entityId: clientId,
      entityName: originalData.denominacion,
      details: `quito el mapeo de Tango de <a href="/clients/${clientId}" class="font-bold text-primary hover:underline">${originalData.denominacion}</a>`,
      ownerName: originalData.ownerName,
    });

    return NextResponse.json({ ok: true });
  } catch (error) {
    return clientErrorResponse(error, {
      action: 'TANGO MAPPING DELETE',
      requesterId: requester.uid,
      publicError: 'No se pudo quitar el mapeo Tango del cliente.',
    });
  }
}
