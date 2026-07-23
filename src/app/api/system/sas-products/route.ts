import { NextResponse } from 'next/server';
import { isServerResponse, requireServerManagement, requireServerUser } from '@/lib/server/auth';
import { systemErrorResponse } from '@/app/api/system/errors';
import { getSasProductsServer, saveSasProductsServer } from '@/lib/server/system-config';

export async function GET(request: Request) {
  const requester = await requireServerUser(request);
  if (isServerResponse(requester)) return requester;

  try {
    return NextResponse.json({ products: await getSasProductsServer() });
  } catch (error) {
    return systemErrorResponse(error, {
      action: 'SAS PRODUCTS GET',
      requesterId: requester.uid,
      publicError: 'No se pudo cargar el tarifario de productos digitales.',
    });
  }
}

export async function PUT(request: Request) {
  const requester = await requireServerManagement(request);
  if (isServerResponse(requester)) return requester;

  try {
    const body = await request.json();
    return NextResponse.json({ products: await saveSasProductsServer(body?.products, requester) });
  } catch (error) {
    return systemErrorResponse(error, {
      action: 'SAS PRODUCTS SAVE',
      requesterId: requester.uid,
      publicError: 'No se pudo guardar el tarifario de productos digitales.',
    });
  }
}
