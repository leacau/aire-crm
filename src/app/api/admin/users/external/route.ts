import { NextResponse } from 'next/server';
import { authAdmin, dbAdmin } from '@/lib/firebase-admin';
import { isServerResponse, requireServerManagement } from '@/lib/server/auth';

export async function POST(request: Request) {
  const requester = await requireServerManagement(request);
  if (isServerResponse(requester)) return requester;

  const body = await request.json();
  const email = String(body.email || '').trim().toLowerCase();
  const password = String(body.password || '');
  const name = String(body.name || '').trim();

  if (!email || !email.includes('@') || !name || password.length < 8) {
    return NextResponse.json(
      { error: 'Nombre, correo válido y contraseña de al menos 8 caracteres son obligatorios.' },
      { status: 400 },
    );
  }

  try {
    const authUser = await authAdmin.createUser({
      email,
      password,
      displayName: name,
      emailVerified: true,
      disabled: false,
    });

    await dbAdmin.collection('users').doc(authUser.uid).set({
      name,
      email,
      role: 'Asesor Canjes',
      area: 'Canjes',
      externalUser: true,
      createdAt: new Date().toISOString(),
      createdBy: requester.uid,
    });

    return NextResponse.json({ id: authUser.uid, email, name });
  } catch (error: any) {
    const code = error?.code || '';
    const message = code === 'auth/email-already-exists'
      ? 'Ya existe una cuenta con ese correo.'
      : 'No se pudo crear la cuenta externa.';
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
