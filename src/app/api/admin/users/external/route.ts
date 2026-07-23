import { NextResponse } from 'next/server';
import { isServerResponse, requireServerManagement } from '@/lib/server/auth';
import { createExternalUserServer } from '@/lib/server/users';
import { userErrorResponse } from '@/app/api/users/errors';

export async function POST(request: Request) {
  const requester = await requireServerManagement(request);
  if (isServerResponse(requester)) return requester;

  try {
    const body = await request.json();
    const user = await createExternalUserServer(body, requester);
    return NextResponse.json(user);
  } catch (error) {
    return userErrorResponse(error, {
      action: 'CREATE EXTERNAL',
      requesterId: requester.uid,
      publicError: 'No se pudo crear la cuenta externa.',
      status: 400,
    });
  }
}
