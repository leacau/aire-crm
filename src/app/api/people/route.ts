import { NextResponse } from 'next/server';
import { isServerResponse, requireServerUser } from '@/lib/server/auth';
import { peopleErrorResponse } from '@/app/api/people/errors';
import { createPersonServer } from '@/lib/server/people';
import type { Person } from '@/lib/types';

export async function POST(request: Request) {
  const requester = await requireServerUser(request);
  if (isServerResponse(requester)) return requester;

  try {
    const body = await request.json();
    const personData = body?.personData as Omit<Person, 'id'> | undefined;

    return NextResponse.json({ id: await createPersonServer(personData, requester) });
  } catch (error) {
    return peopleErrorResponse(error, {
      action: 'CREATE',
      requesterId: requester.uid,
      publicError: 'No se pudo crear el contacto.',
    });
  }
}
