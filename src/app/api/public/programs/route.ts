import { NextResponse } from 'next/server';
import { dbAdmin } from '@/lib/firebase-admin';

export async function GET() {
  const snapshot = await dbAdmin.collection('programs').orderBy('name').get();
  const programs = snapshot.docs.map(doc => {
    const data = doc.data();
    return {
      id: doc.id,
      name: data.name || 'Programa',
    };
  });

  return NextResponse.json({ programs });
}
