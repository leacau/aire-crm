import { NextResponse } from 'next/server';
import { dbAdmin } from '@/lib/firebase-admin';
import { isServerResponse, requireServerManagement, requireServerUser } from '@/lib/server/auth';
import { logServerActivity } from '@/lib/server/activity';
import type { SasProductConfig } from '@/lib/types';

const SAS_PRODUCTS_DOC_ID = 'sas_products';

function normalizeNumber(value: unknown) {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function normalizeProducts(rawProducts: unknown): SasProductConfig[] {
  if (!Array.isArray(rawProducts)) return [];

  return rawProducts.map((product, index) => {
    const item = product && typeof product === 'object' ? product as Partial<SasProductConfig> : {};
    return {
      id: String(item.id || `product-${index}`),
      format: String(item.format || '').trim(),
      type: String(item.type || '').trim(),
      detail: String(item.detail || '').trim(),
      unitRate: normalizeNumber(item.unitRate),
      cpm: normalizeNumber(item.cpm),
    };
  }).filter(product => product.id && product.format);
}

export async function GET(request: Request) {
  const requester = await requireServerUser(request);
  if (isServerResponse(requester)) return requester;

  const snap = await dbAdmin.collection('system_config').doc(SAS_PRODUCTS_DOC_ID).get();
  const products = snap.exists ? normalizeProducts(snap.data()?.products) : [];

  return NextResponse.json({ products });
}

export async function PUT(request: Request) {
  const requester = await requireServerManagement(request);
  if (isServerResponse(requester)) return requester;

  const body = await request.json();
  if (!Array.isArray(body?.products)) {
    return NextResponse.json({ error: 'La lista de productos es obligatoria.' }, { status: 400 });
  }

  const products = normalizeProducts(body.products);
  await dbAdmin.collection('system_config').doc(SAS_PRODUCTS_DOC_ID).set({ products }, { merge: true });

  await logServerActivity({
    userId: requester.uid,
    userName: requester.name || requester.email || 'Usuario',
    type: 'update',
    entityType: 'system_config',
    entityId: SAS_PRODUCTS_DOC_ID,
    entityName: 'Productos Digitales SAS',
    details: 'actualizo el tarifario de productos digitales.',
    ownerName: 'Sistema',
  });

  return NextResponse.json({ products });
}
