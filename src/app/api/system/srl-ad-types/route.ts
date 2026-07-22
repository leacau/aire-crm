import { NextResponse } from 'next/server';
import { dbAdmin } from '@/lib/firebase-admin';
import { isServerResponse, requireServerManagement, requireServerUser } from '@/lib/server/auth';
import { logServerActivity } from '@/lib/server/activity';
import { systemErrorResponse } from '@/app/api/system/errors';

const SRL_AD_TYPES_DOC_ID = 'srl_ad_types';
const DEFAULT_SRL_AD_TYPES = ['Spot', 'PNT', 'Auspicio', 'Nota Comercial', 'Sorteo', 'Juego'];

function normalizeTypes(rawTypes: unknown): string[] {
  if (!Array.isArray(rawTypes)) return DEFAULT_SRL_AD_TYPES;

  const seen = new Set<string>();
  return rawTypes
    .map(type => String(type).trim())
    .filter(type => {
      if (!type || seen.has(type.toLowerCase())) return false;
      seen.add(type.toLowerCase());
      return true;
    });
}

export async function GET(request: Request) {
  const requester = await requireServerUser(request);
  if (isServerResponse(requester)) return requester;

  try {
    const snap = await dbAdmin.collection('system_config').doc(SRL_AD_TYPES_DOC_ID).get();
    const types = snap.exists ? normalizeTypes(snap.data()?.types) : DEFAULT_SRL_AD_TYPES;

    return NextResponse.json({ types });
  } catch (error) {
    return systemErrorResponse(error, {
      action: 'SRL AD TYPES GET',
      requesterId: requester.uid,
      publicError: 'No se pudieron cargar los formatos comerciales de Radio/TV.',
    });
  }
}

export async function PUT(request: Request) {
  const requester = await requireServerManagement(request);
  if (isServerResponse(requester)) return requester;

  try {
    const body = await request.json();
    if (!Array.isArray(body?.types)) {
      return NextResponse.json({ error: 'La lista de formatos es obligatoria.' }, { status: 400 });
    }

    const types = normalizeTypes(body.types);
    await dbAdmin.collection('system_config').doc(SRL_AD_TYPES_DOC_ID).set({ types }, { merge: true });

    await logServerActivity({
      userId: requester.uid,
      userName: requester.name || requester.email || 'Usuario',
      type: 'update',
      entityType: 'system_config',
      entityId: SRL_AD_TYPES_DOC_ID,
      entityName: 'Tipos de Aviso SRL',
      details: 'actualizo la lista de formatos comerciales de Radio/TV.',
      ownerName: 'Sistema',
    });

    return NextResponse.json({ types });
  } catch (error) {
    return systemErrorResponse(error, {
      action: 'SRL AD TYPES SAVE',
      requesterId: requester.uid,
      publicError: 'No se pudieron guardar los formatos comerciales de Radio/TV.',
    });
  }
}
