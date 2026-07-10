import { NextResponse } from 'next/server';
import { FieldValue } from 'firebase-admin/firestore';
import { dbAdmin } from '@/lib/firebase-admin';
import { isServerResponse, requireServerUser } from '@/lib/server/auth';

export async function POST(request: Request) {
  const requester = await requireServerUser(request);
  if (isServerResponse(requester)) return requester;

  const body = await request.json();
  const monthKey = String(body?.monthKey || '').trim();
  const advisorId = String(body?.advisorId || '').trim();
  const amountToAdd = Number(body?.amountToAdd || 0);

  if (!/^\d{4}-\d{2}$/.test(monthKey)) {
    return NextResponse.json({ error: 'Mes invalido.' }, { status: 400 });
  }

  if (!advisorId || !Number.isFinite(amountToAdd)) {
    return NextResponse.json({ error: 'Datos invalidos para actualizar estadisticas.' }, { status: 400 });
  }

  await dbAdmin.collection('estadisticas_mensuales').doc(monthKey).set(
    {
      totalGeneral: FieldValue.increment(amountToAdd),
      [`total_asesor_${advisorId}`]: FieldValue.increment(amountToAdd),
      updatedAt: FieldValue.serverTimestamp(),
    },
    { merge: true },
  );

  return NextResponse.json({ ok: true });
}
