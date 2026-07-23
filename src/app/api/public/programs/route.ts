import { NextResponse } from 'next/server';
import { programErrorResponse } from '@/app/api/programs/errors';
import { listPublicProgramsServer } from '@/lib/server/programs';

export async function GET() {
  try {
    return NextResponse.json({ programs: await listPublicProgramsServer() });
  } catch (error) {
    return programErrorResponse(error, {
      action: 'PUBLIC LIST',
      publicError: 'No se pudieron cargar los programas publicos.',
    });
  }
}
