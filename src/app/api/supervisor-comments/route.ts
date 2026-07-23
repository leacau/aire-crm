import { NextResponse } from 'next/server';
import { isServerResponse, requireServerUser } from '@/lib/server/auth';
import { supervisorCommentErrorResponse } from '@/app/api/supervisor-comments/errors';
import {
  createSupervisorCommentServer,
  listSupervisorCommentsServer,
} from '@/lib/server/supervisor-comments';

export async function GET(request: Request) {
  const requester = await requireServerUser(request);
  if (isServerResponse(requester)) return requester;

  try {
    const { searchParams } = new URL(request.url);
    return NextResponse.json({
      comments: await listSupervisorCommentsServer({
        entityType: searchParams.get('entityType'),
        entityId: searchParams.get('entityId'),
        userId: searchParams.get('userId'),
      }, requester),
    });
  } catch (error) {
    return supervisorCommentErrorResponse(error, {
      action: 'LIST',
      requesterId: requester.uid,
      publicError: 'No se pudieron cargar los comentarios de supervision.',
    });
  }
}

export async function POST(request: Request) {
  const requester = await requireServerUser(request);
  if (isServerResponse(requester)) return requester;

  try {
    const body = await request.json();
    return NextResponse.json({ id: await createSupervisorCommentServer(body, requester) });
  } catch (error) {
    return supervisorCommentErrorResponse(error, {
      action: 'CREATE',
      requesterId: requester.uid,
      publicError: 'No se pudo crear el comentario de supervision.',
    });
  }
}
