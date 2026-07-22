import { NextResponse } from 'next/server';
import { dbAdmin } from '@/lib/firebase-admin';
import { programErrorResponse } from '@/app/api/programs/errors';

export async function GET() {
  try {
    const snapshot = await dbAdmin.collection('programs').orderBy('name').get();
    const programs = snapshot.docs.map(doc => {
      const data = doc.data();
      return {
        id: doc.id,
        name: data.name || 'Programa',
      };
    });

    return NextResponse.json({ programs });
  } catch (error) {
    return programErrorResponse(error, {
      action: 'PUBLIC LIST',
      publicError: 'No se pudieron cargar los programas publicos.',
    });
  }
}
