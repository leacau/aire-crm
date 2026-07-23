import { NextResponse } from 'next/server';
import { isServerResponse, requireServerManagement } from '@/lib/server/auth';
import { syncAuthUsersServer } from '@/lib/server/users';
import { userErrorResponse } from '@/app/api/users/errors';

export async function POST(request: Request) {
  const requester = await requireServerManagement(request);
  if (isServerResponse(requester)) return requester;

  try {
    const result = await syncAuthUsersServer();
    return NextResponse.json(result);
  } catch (error) {
    return userErrorResponse(error, {
      action: 'AUTH SYNC',
      requesterId: requester.uid,
      publicError: 'No se pudieron sincronizar los usuarios.',
    });
  }
}
