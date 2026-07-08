import { FieldValue } from 'firebase-admin/firestore';
import { format, isSaturday, isSunday, parseISO } from 'date-fns';
import { es } from 'date-fns/locale';
import { dbAdmin } from '@/lib/firebase-admin';
import { hasServerManagementPrivileges, type ServerUser } from '@/lib/server/auth';
import { serializeDocument } from '@/lib/server/firestore';
import { logServerActivity } from '@/lib/server/activity';
import type { User, VacationRequest, VacationRequestStatus } from '@/lib/types';

export type VacationEmailPayload = {
  to: string;
  subject: string;
  body: string;
};

export class VacationRequestApiError extends Error {
  constructor(
    message: string,
    public readonly status = 400,
  ) {
    super(message);
  }
}

function assertCanManage(requester: ServerUser) {
  if (!hasServerManagementPrivileges(requester)) {
    throw new VacationRequestApiError('Forbidden', 403);
  }
}

function assertCanAccessRequest(requester: ServerUser, request: VacationRequest) {
  if (request.userId !== requester.uid && !hasServerManagementPrivileges(requester)) {
    throw new VacationRequestApiError('Forbidden', 403);
  }
}

function normalizePayload<T extends Record<string, unknown>>(data: T): Partial<T> {
  return Object.fromEntries(
    Object.entries(data).filter(([, value]) => value !== undefined),
  ) as Partial<T>;
}

export async function getSystemHolidaysServer(): Promise<string[]> {
  const snap = await dbAdmin.collection('system_config').doc('holidays').get();
  const dates = snap.exists ? snap.data()?.dates : [];
  return Array.isArray(dates) ? dates.filter((date): date is string => typeof date === 'string') : [];
}

export function calculateBusinessDaysServer(
  startDateStr: string,
  returnDateStr: string,
  holidays: string[],
): number {
  const start = parseISO(startDateStr);
  const end = parseISO(returnDateStr);
  const holidaySet = new Set(holidays);

  let count = 0;
  let current = start;

  while (current < end) {
    const dateStr = format(current, 'yyyy-MM-dd');
    if (!isSaturday(current) && !isSunday(current) && !holidaySet.has(dateStr)) {
      count += 1;
    }

    current = new Date(current);
    current.setDate(current.getDate() + 1);
  }

  return count;
}

export async function listVacationRequests(requester: ServerUser): Promise<VacationRequest[]> {
  const snapshot = await dbAdmin.collection('licencias').orderBy('requestDate', 'desc').get();
  let requests = snapshot.docs.map(doc => serializeDocument<VacationRequest>(doc.id, doc.data()));

  if (!hasServerManagementPrivileges(requester)) {
    requests = requests.filter(request => request.userId === requester.uid);
  }

  return requests;
}

export async function createVacationRequestServer(
  requestData: Omit<VacationRequest, 'id' | 'status'>,
  managerEmail: string | null,
  requester: ServerUser,
): Promise<{ docId: string; emailPayload: VacationEmailPayload | null }> {
  if (!requestData?.userId || !requestData.startDate || !requestData.returnDate) {
    throw new VacationRequestApiError('Faltan datos obligatorios de la solicitud.', 400);
  }

  if (requestData.userId !== requester.uid && !hasServerManagementPrivileges(requester)) {
    throw new VacationRequestApiError('Forbidden', 403);
  }

  const holidays = await getSystemHolidaysServer();
  const finalDaysRequested = calculateBusinessDaysServer(
    requestData.startDate,
    requestData.returnDate,
    holidays,
  );

  if (finalDaysRequested <= 0) {
    throw new VacationRequestApiError('El rango de fechas seleccionado no consume dias habiles.', 400);
  }

  const userRef = dbAdmin.collection('users').doc(requestData.userId);
  const newLicenseRef = dbAdmin.collection('licencias').doc();

  await dbAdmin.runTransaction(async transaction => {
    const userDoc = await transaction.get(userRef);
    if (!userDoc.exists) throw new VacationRequestApiError('Usuario no encontrado.', 404);

    const userData = userDoc.data() as User;
    const currentDays = userData.vacationDays || 0;

    if (currentDays < finalDaysRequested) {
      throw new VacationRequestApiError(
        `No tienes suficientes dias disponibles. Solicitas ${finalDaysRequested} y tienes ${currentDays}.`,
        400,
      );
    }

    transaction.update(userRef, {
      vacationDays: currentDays - finalDaysRequested,
    });

    transaction.set(newLicenseRef, {
      ...requestData,
      daysRequested: finalDaysRequested,
      status: 'Pendiente',
      requestDate: FieldValue.serverTimestamp(),
      holidays,
    });
  });

  let emailPayload: VacationEmailPayload | null = null;
  if (managerEmail) {
    emailPayload = {
      to: managerEmail,
      subject: `Nueva Solicitud de Licencia de ${requestData.userName}`,
      body: `
        <p>Hola,</p>
        <p>Has recibido una nueva solicitud de licencia de <strong>${requestData.userName}</strong>.</p>
        <p><strong>Salida:</strong> ${format(parseISO(requestData.startDate), 'P', { locale: es })}</p>
        <p><strong>Retorno:</strong> ${format(parseISO(requestData.returnDate), 'P', { locale: es })}</p>
        <p><strong>Dias a consumir:</strong> ${finalDaysRequested}</p>
        <p><em>Estos dias ya han sido descontados provisoriamente del saldo del asesor.</em></p>
        <p>Para aprobar o rechazar esta solicitud, por favor ingresa a la seccion "Licencias" del CRM.</p>
      `,
    };
  }

  return { docId: newLicenseRef.id, emailPayload };
}

export async function updateVacationRequestServer(
  requestId: string,
  updates: Partial<VacationRequest>,
  requester: ServerUser,
): Promise<void> {
  const safeUpdates = updates || {};
  const holidays = await getSystemHolidaysServer();
  const requestRef = dbAdmin.collection('licencias').doc(requestId);

  await dbAdmin.runTransaction(async transaction => {
    const requestSnap = await transaction.get(requestRef);
    if (!requestSnap.exists) throw new VacationRequestApiError('Solicitud no encontrada.', 404);

    const oldRequest = serializeDocument<VacationRequest>(requestSnap.id, requestSnap.data());
    assertCanAccessRequest(requester, oldRequest);

    const userRef = dbAdmin.collection('users').doc(oldRequest.userId);
    const userSnap = await transaction.get(userRef);
    if (!userSnap.exists) throw new VacationRequestApiError('Usuario no encontrado.', 404);

    const userData = userSnap.data() as User;
    let newDaysRequested = oldRequest.daysRequested;

    const newStartDate = safeUpdates.startDate || oldRequest.startDate;
    const newReturnDate = safeUpdates.returnDate || oldRequest.returnDate;

    if (newStartDate !== oldRequest.startDate || newReturnDate !== oldRequest.returnDate) {
      newDaysRequested = calculateBusinessDaysServer(newStartDate, newReturnDate, holidays);
    }

    if (newDaysRequested <= 0) {
      throw new VacationRequestApiError('El rango no consume dias habiles.', 400);
    }

    const currentBalance = userData.vacationDays || 0;
    let balanceBeforeThisRequest = currentBalance;
    if (oldRequest.status === 'Pendiente' || oldRequest.status === 'Aprobado') {
      balanceBeforeThisRequest += oldRequest.daysRequested;
    }

    if (balanceBeforeThisRequest < newDaysRequested) {
      throw new VacationRequestApiError('Saldo insuficiente.', 400);
    }

    const finalBalance = balanceBeforeThisRequest - newDaysRequested;
    if (finalBalance !== currentBalance) {
      transaction.update(userRef, { vacationDays: finalBalance });
    }

    const { id: _ignoredId, ...rawUpdates } = safeUpdates;
    transaction.update(requestRef, {
      ...normalizePayload(rawUpdates as Record<string, unknown>),
      daysRequested: newDaysRequested,
      holidays,
      updatedAt: FieldValue.serverTimestamp(),
    });
  });
}

export async function approveVacationRequestServer(
  requestId: string,
  newStatus: VacationRequestStatus,
  approverId: string,
  applicantEmail: string | null,
  requester: ServerUser,
): Promise<{ emailPayload: VacationEmailPayload | null }> {
  assertCanManage(requester);

  if (!['Pendiente', 'Aprobado', 'Rechazado'].includes(newStatus)) {
    throw new VacationRequestApiError('Estado invalido.', 400);
  }

  const requestRef = dbAdmin.collection('licencias').doc(requestId);
  let pendingDaysAfterUpdate: number | null = null;

  await dbAdmin.runTransaction(async transaction => {
    const requestDoc = await transaction.get(requestRef);
    if (!requestDoc.exists) throw new VacationRequestApiError('Solicitud no encontrada.', 404);

    const requestData = requestDoc.data() as VacationRequest;
    if (requestData.status === newStatus) return;

    const userRef = dbAdmin.collection('users').doc(requestData.userId);
    const userDoc = await transaction.get(userRef);
    if (!userDoc.exists) throw new VacationRequestApiError('Usuario solicitante no encontrado.', 404);

    const userData = userDoc.data() as User;
    let newVacationDays = userData.vacationDays || 0;

    if (requestData.status === 'Pendiente' && newStatus === 'Rechazado') {
      newVacationDays += requestData.daysRequested;
    } else if (requestData.status === 'Aprobado' && newStatus === 'Rechazado') {
      newVacationDays += requestData.daysRequested;
    } else if (
      requestData.status === 'Rechazado' &&
      (newStatus === 'Aprobado' || newStatus === 'Pendiente')
    ) {
      newVacationDays -= requestData.daysRequested;
    }

    if (newVacationDays !== (userData.vacationDays || 0)) {
      transaction.update(userRef, { vacationDays: newVacationDays });
    }

    pendingDaysAfterUpdate = newVacationDays;
    transaction.update(requestRef, {
      status: newStatus,
      approvedBy: approverId || requester.uid,
      approvedAt: new Date().toISOString(),
    });
  });

  const requestAfterUpdateSnap = await requestRef.get();
  const requestAfterUpdate = requestAfterUpdateSnap.data() as VacationRequest | undefined;

  let emailPayload: VacationEmailPayload | null = null;
  if (applicantEmail && requestAfterUpdate) {
    if (newStatus === 'Aprobado') {
      const start = format(parseISO(requestAfterUpdate.startDate), "d 'de' MMMM 'de' yyyy", {
        locale: es,
      });
      const returnDate = format(parseISO(requestAfterUpdate.returnDate), "d 'de' MMMM 'de' yyyy", {
        locale: es,
      });
      const pending = pendingDaysAfterUpdate ?? 0;

      emailPayload = {
        to: applicantEmail,
        subject: 'Autorizacion de licencia',
        body: `<p>Tu licencia del ${start} (retorno el ${returnDate}) ha sido aprobada.</p><p>Saldo pendiente: ${pending} dias.</p>`,
      };
    } else if (newStatus === 'Rechazado') {
      emailPayload = {
        to: applicantEmail,
        subject: 'Solicitud Rechazada',
        body: '<p>Tu solicitud de licencia ha sido rechazada. Los dias se han reintegrado a tu saldo.</p>',
      };
    }
  }

  return { emailPayload };
}

export async function annulVacationRequestServer(
  requestId: string,
  reason: string,
  managerId: string,
  managerName: string,
  applicantEmail: string | null,
  requester: ServerUser,
): Promise<{ emailPayload: VacationEmailPayload | null }> {
  assertCanManage(requester);

  if (!reason.trim()) {
    throw new VacationRequestApiError('El motivo de anulacion es obligatorio.', 400);
  }

  const requestRef = dbAdmin.collection('licencias').doc(requestId);
  const effectiveManagerId = managerId || requester.uid;
  const effectiveManagerName = managerName || requester.name || requester.email || 'Usuario';

  await dbAdmin.runTransaction(async transaction => {
    const requestDoc = await transaction.get(requestRef);
    if (!requestDoc.exists) throw new VacationRequestApiError('Solicitud no encontrada.', 404);

    const requestData = requestDoc.data() as VacationRequest;
    if (requestData.status !== 'Aprobado') {
      throw new VacationRequestApiError('Solo se pueden anular licencias que ya han sido aprobadas.', 400);
    }

    const userRef = dbAdmin.collection('users').doc(requestData.userId);
    const userDoc = await transaction.get(userRef);
    if (!userDoc.exists) throw new VacationRequestApiError('Usuario solicitante no encontrado.', 404);

    const userData = userDoc.data() as User;
    transaction.update(userRef, {
      vacationDays: (userData.vacationDays || 0) + requestData.daysRequested,
    });

    transaction.update(requestRef, {
      status: 'Anulado',
      cancellationReason: reason,
      cancelledBy: effectiveManagerId,
      cancelledByName: effectiveManagerName,
      cancelledAt: new Date().toISOString(),
    });
  });

  const emailPayload = applicantEmail
    ? {
        to: applicantEmail,
        subject: 'Anulacion de licencia aprobada',
        body: `<p>Tu licencia aprobada ha sido <strong>ANULADA</strong> por ${effectiveManagerName}. Motivo: ${reason}</p>`,
      }
    : null;

  return { emailPayload };
}

export async function deleteVacationRequestServer(
  requestId: string,
  requester: ServerUser,
): Promise<void> {
  const requestRef = dbAdmin.collection('licencias').doc(requestId);

  await dbAdmin.runTransaction(async transaction => {
    const requestSnap = await transaction.get(requestRef);
    if (!requestSnap.exists) throw new VacationRequestApiError('Solicitud no encontrada.', 404);

    const requestData = serializeDocument<VacationRequest>(requestSnap.id, requestSnap.data());
    assertCanAccessRequest(requester, requestData);

    if (requestData.status === 'Pendiente' || requestData.status === 'Aprobado') {
      const userRef = dbAdmin.collection('users').doc(requestData.userId);
      const userSnap = await transaction.get(userRef);
      if (!userSnap.exists) throw new VacationRequestApiError('Usuario solicitante no encontrado.', 404);

      const userData = userSnap.data() as User;
      transaction.update(userRef, {
        vacationDays: (userData.vacationDays || 0) + requestData.daysRequested,
      });
    }

    transaction.delete(requestRef);
  });
}

export async function adjustVacationDaysServer(
  userId: string,
  days: number,
  updatedBy: string,
  updatedByName: string,
  requester: ServerUser,
): Promise<void> {
  assertCanManage(requester);

  if (days === 0) {
    throw new VacationRequestApiError('La cantidad de dias a ajustar debe ser distinta de cero.', 400);
  }

  const userRef = dbAdmin.collection('users').doc(userId);
  await dbAdmin.runTransaction(async transaction => {
    const userSnap = await transaction.get(userRef);
    if (!userSnap.exists) throw new VacationRequestApiError('Usuario no encontrado.', 404);

    const userData = userSnap.data() as User;
    transaction.update(userRef, {
      vacationDays: (userData.vacationDays || 0) + days,
      updatedAt: FieldValue.serverTimestamp(),
      updatedBy: updatedBy || requester.uid,
    });
  });

  const updatedUser = await userRef.get();
  const updatedUserData = updatedUser.data() as User | undefined;
  const action = days > 0 ? 'agrego' : 'quito';
  const amount = Math.abs(days);

  await logServerActivity({
    userId: updatedBy || requester.uid,
    userName: updatedByName || requester.name || requester.email || 'Usuario',
    type: 'update',
    entityType: 'user',
    entityId: userId,
    entityName: updatedUserData?.name || 'Usuario',
    details: `${action} <strong>${amount}</strong> dias de licencia a <strong>${updatedUserData?.name || 'un usuario'}</strong>`,
  });
}
