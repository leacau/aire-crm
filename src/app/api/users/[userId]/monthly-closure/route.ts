import { NextResponse } from 'next/server';
import { FieldPath } from 'firebase-admin/firestore';
import { dbAdmin } from '@/lib/firebase-admin';
import { isServerResponse, requireServerManagement } from '@/lib/server/auth';
import { logServerActivity } from '@/lib/server/activity';
import { userErrorResponse } from '@/app/api/users/errors';

type RouteContext = {
  params: Promise<{ userId: string }>;
};

export async function PUT(request: Request, context: RouteContext) {
  const requester = await requireServerManagement(request);
  if (isServerResponse(requester)) return requester;

  try {
    const { userId } = await context.params;
    const body = await request.json();
    const month = String(body?.month || '').trim();
    const value = Number(body?.value);

    if (!/^\d{4}-\d{2}$/.test(month)) {
      return NextResponse.json({ error: 'El mes debe tener formato YYYY-MM.' }, { status: 400 });
    }

    if (!Number.isFinite(value)) {
      return NextResponse.json({ error: 'El valor de cierre debe ser numerico.' }, { status: 400 });
    }

    const userRef = dbAdmin.collection('users').doc(userId);
    const advisorSnap = await userRef.get();
    if (!advisorSnap.exists) {
      return NextResponse.json({ error: 'Asesor no encontrado.' }, { status: 404 });
    }

    const advisorName = String(advisorSnap.data()?.name || 'Asesor');
    await userRef.update(new FieldPath('monthlyClosures', month), value);

    await logServerActivity({
      userId: requester.uid,
      userName: requester.name || requester.email || 'Usuario',
      type: 'update',
      entityType: 'monthly_closure',
      entityId: userId,
      entityName: advisorName,
      details: `registro el cierre de <strong>${month}</strong> para <strong>${advisorName}</strong> con un valor de <strong>$${value.toLocaleString('es-AR')}</strong>`,
      ownerName: advisorName,
    });

    return NextResponse.json({ ok: true });
  } catch (error) {
    return userErrorResponse(error, {
      action: 'MONTHLY CLOSURE',
      requesterId: requester.uid,
      publicError: 'No se pudo guardar el cierre mensual del asesor.',
    });
  }
}
