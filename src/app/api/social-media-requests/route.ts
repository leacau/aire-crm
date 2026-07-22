import { NextResponse } from 'next/server';
import { FieldValue } from 'firebase-admin/firestore';
import { dbAdmin } from '@/lib/firebase-admin';
import { getRequesterName } from '@/app/api/clients/utils';
import { isServerResponse, requireServerUser } from '@/lib/server/auth';
import { logServerActivity } from '@/lib/server/activity';
import {
  canAssignAdvisorScopedOwner,
  filterAccessibleAdvisorScopedRecords,
} from '@/lib/server/advisor-scoped-access';
import {
  cleanSocialMediaPayload,
  compareSocialMediaRequestsByCreatedAtDesc,
  mapSocialMediaRequest,
} from '@/app/api/social-media-requests/utils';
import type { SocialMediaRequest } from '@/lib/types';

async function getFilteredRequests(field?: string, value?: string): Promise<SocialMediaRequest[]> {
  const collectionRef = dbAdmin.collection('social_media_requests');
  const snapshot = field && value
    ? await collectionRef.where(field, '==', value).get()
    : await collectionRef.get();

  return snapshot.docs
    .map(doc => mapSocialMediaRequest(doc.id, doc.data()))
    .sort(compareSocialMediaRequestsByCreatedAtDesc);
}

export async function GET(request: Request) {
  const requester = await requireServerUser(request);
  if (isServerResponse(requester)) return requester;

  try {
    const { searchParams } = new URL(request.url);
    const clientId = searchParams.get('clientId');
    const orderId = searchParams.get('orderId');

    let requests: SocialMediaRequest[];
    if (clientId) {
      requests = await getFilteredRequests('clientId', clientId);
    } else if (orderId) {
      requests = await getFilteredRequests('orderId', orderId);
    } else {
      requests = await getFilteredRequests();
    }

    requests = await filterAccessibleAdvisorScopedRecords(requests, requester);

    return NextResponse.json({ requests });
  } catch (error: any) {
    console.error('SOCIAL MEDIA REQUESTS LIST ERROR:', {
      requester: requester.uid,
      code: error?.code,
      message: error?.message,
    });
    return NextResponse.json({
      error: 'No se pudieron cargar los pedidos de redes.',
      details: error?.message || 'Error desconocido',
    }, { status: 502 });
  }
}

export async function POST(request: Request) {
  const requester = await requireServerUser(request);
  if (isServerResponse(requester)) return requester;

  try {
    const body = await request.json();
    const requestData = body?.requestData as Omit<SocialMediaRequest, 'id' | 'createdAt'> | undefined;

    if (!requestData?.clientId || !requestData.clientName || !requestData.contentType) {
      return NextResponse.json({ error: 'Cliente y tipo de contenido son obligatorios.' }, { status: 400 });
    }

    const requesterName = getRequesterName(requester);
    const advisorId = canAssignAdvisorScopedOwner(requester) && requestData.advisorId
      ? requestData.advisorId
      : requester.uid;
    const advisorName = canAssignAdvisorScopedOwner(requester) && requestData.advisorName
      ? requestData.advisorName
      : requesterName;
    const dataToSave = {
      ...cleanSocialMediaPayload(requestData as unknown as Record<string, unknown>),
      advisorId,
      advisorName,
      createdAt: FieldValue.serverTimestamp(),
    };

    const docRef = await dbAdmin.collection('social_media_requests').add(dataToSave);

    await logServerActivity({
      userId: requester.uid,
      userName: requesterName,
      type: 'create',
      entityType: 'social_media_request' as any,
      entityId: docRef.id,
      entityName: requestData.clientName,
      details: `creo un pedido de redes para <strong>${requestData.clientName}</strong> (${requestData.contentType})`,
      ownerName: advisorName,
    });

    return NextResponse.json({ id: docRef.id });
  } catch (error: any) {
    console.error('SOCIAL MEDIA REQUEST CREATE ERROR:', {
      requester: requester.uid,
      code: error?.code,
      message: error?.message,
    });
    return NextResponse.json({
      error: 'No se pudo crear el pedido de redes.',
      details: error?.message || 'Error desconocido',
    }, { status: 502 });
  }
}
