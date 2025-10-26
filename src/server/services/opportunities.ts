import { FieldValue, Timestamp } from 'firebase-admin/firestore';
import type { QueryDocumentSnapshot } from 'firebase-admin/firestore';

import type { Client, Opportunity, User } from '@/lib/types';

import { createCalendarEvent, sendEmail } from '@/lib/google-gmail-service';
import { adminDb } from '../firebase-admin';
import { logActivity } from './activity-log';

const opportunitiesCollection = adminDb.collection('opportunities');
const clientsCollection = adminDb.collection('clients');
const invoicesCollection = adminDb.collection('invoices');
const usersCollection = adminDb.collection('users');

const toIsoDate = (value: unknown) =>
  value instanceof Timestamp ? value.toDate().toISOString() : value;

const toOpportunity = (doc: QueryDocumentSnapshot): Opportunity => {
  const data = doc.data();
  const converted: Record<string, unknown> = { ...data };

  if (data.closeDate) {
    if (data.closeDate instanceof Timestamp) {
      converted.closeDate = data.closeDate.toDate().toISOString().split('T')[0];
    } else {
      converted.closeDate = new Date(data.closeDate).toISOString().split('T')[0];
    }
  }

  if (data.updatedAt) {
    converted.updatedAt = toIsoDate(data.updatedAt);
  }

  return {
    id: doc.id,
    ...converted,
  } as Opportunity;
};

const createReminderEvent = async (
  accessToken: string,
  ownerEmail: string,
  clientName: string,
  opportunityTitle: string,
  dueDate: Date,
) => {
  const event = {
    summary: `Vencimiento Pauta: ${clientName}`,
    description: `Recordatorio de vencimiento de pauta para la oportunidad "${opportunityTitle}".\nCliente: ${clientName}`,
    start: { date: dueDate.toISOString().split('T')[0] },
    end: { date: dueDate.toISOString().split('T')[0] },
    attendees: [{ email: ownerEmail }, { email: 'lchena@airedesantafe.com.ar' }],
    reminders: {
      useDefault: false,
      overrides: [
        { method: 'popup', minutes: 30 * 24 * 60 },
        { method: 'popup', minutes: 15 * 24 * 60 },
        { method: 'popup', minutes: 7 * 24 * 60 },
        { method: 'popup', minutes: 10 },
      ],
    },
  };
  await createCalendarEvent(accessToken, event);
};

const getUserProfile = async (uid: string): Promise<User | null> => {
  const doc = await usersCollection.doc(uid).get();
  if (!doc.exists) {
    return null;
  }
  return { id: doc.id, ...doc.data() } as User;
};

export type OpportunityMutationContext = {
  userId: string;
  userName: string;
  ownerName: string;
  accessToken?: string | null;
};

export type CreateOpportunityInput = Omit<Opportunity, 'id'>;

export type UpdateOpportunityInput = Partial<Omit<Opportunity, 'id'>>;

export async function listOpportunities(clientId?: string): Promise<Opportunity[]> {
  const baseQuery = clientId
    ? opportunitiesCollection.where('clientId', '==', clientId)
    : opportunitiesCollection;
  const snapshot = await baseQuery.orderBy('title').get();
  return snapshot.docs.map(toOpportunity);
}

export async function createOpportunity(
  data: CreateOpportunityInput,
  context: OpportunityMutationContext,
): Promise<string> {
  const payload: Record<string, unknown> = { ...data };

  if (payload.agencyId === undefined) {
    delete payload.agencyId;
  }

  delete payload.fechaInicioPauta;
  delete payload.fechaFinPauta;
  delete payload.pagado;

  const docRef = await opportunitiesCollection.add({
    ...payload,
    createdAt: FieldValue.serverTimestamp(),
  });

  await logActivity({
    userId: context.userId,
    userName: context.userName,
    type: 'create',
    entityType: 'opportunity',
    entityId: docRef.id,
    entityName: data.title,
    details: `creó la oportunidad <strong>${data.title}</strong> para el cliente <a href="/clients/${data.clientId}" class="font-bold text-primary hover:underline">${data.clientName}</a>`,
    ownerName: context.ownerName,
  });

  return docRef.id;
}

export async function updateOpportunity(
  id: string,
  data: UpdateOpportunityInput,
  context: OpportunityMutationContext,
): Promise<void> {
  const docRef = opportunitiesCollection.doc(id);
  const snapshot = await docRef.get();
  if (!snapshot.exists) {
    throw new Error('Opportunity not found');
  }
  const original = snapshot.data() as Opportunity;

  const updateData: Record<string, unknown> = {
    ...data,
    updatedAt: FieldValue.serverTimestamp(),
  };

  const bonusStateChanged =
    data.bonificacionEstado &&
    data.bonificacionEstado !== original.bonificacionEstado &&
    original.bonificacionEstado === 'Pendiente';

  if (bonusStateChanged && context.accessToken) {
    if (original.stage === 'Negociación a Aprobar') {
      updateData.stage = 'Negociación';
    }

    const clientSnap = await clientsCollection.doc(original.clientId).get();
    if (clientSnap.exists) {
      const clientData = clientSnap.data() as Client;
      const advisor = await getUserProfile(clientData.ownerId);
      if (advisor?.email) {
        const subject = `Bonificación ${data.bonificacionEstado} para ${original.title}`;
        const body = `Hola ${advisor.name},<br/><br/>La bonificación de la oportunidad <strong>${original.title}</strong> del cliente <strong>${clientData.denominacion}</strong> fue marcada como <strong>${data.bonificacionEstado}</strong>.<br/><br/>Puedes ver los detalles en el <a href="https://aire-crm.vercel.app/clients/${original.clientId}">CRM</a>.`;
        try {
          await sendEmail({
            accessToken: context.accessToken,
            to: advisor.email,
            subject,
            body,
          });
        } catch (error) {
          console.error('Failed to send bonus notification email:', error);
        }
      }
    }
  }

  if (data.bonificacionDetalle !== undefined && !data.bonificacionDetalle.trim()) {
    updateData.bonificacionEstado = FieldValue.delete();
    updateData.bonificacionAutorizadoPorId = FieldValue.delete();
    updateData.bonificacionAutorizadoPorNombre = FieldValue.delete();
    updateData.bonificacionFechaAutorizacion = FieldValue.delete();
  }

  if (data.agencyId === '' || data.agencyId === undefined) {
    updateData.agencyId = FieldValue.delete();
  }

  delete updateData.fechaInicioPauta;
  delete updateData.fechaFinPauta;
  delete updateData.pagado;

  if (data.pautados) {
    updateData.pautados = data.pautados.map((item) => ({ ...item }));
  }

  await docRef.update(updateData);

  if (data.pautados && context.accessToken) {
    const clientSnap = await clientsCollection.doc(original.clientId).get();
    if (clientSnap.exists) {
      const clientData = clientSnap.data() as Client;
      const owner = await getUserProfile(clientData.ownerId);

      if (owner?.email) {
        const newPautados = data.pautados.filter(
          (pautado) =>
            !original.pautados?.some(
              (existing) => existing.id === pautado.id && existing.fechaFin === pautado.fechaFin,
            ),
        );

        for (const pautado of newPautados) {
          if (pautado.fechaFin) {
            try {
              const endDate = new Date(pautado.fechaFin);
              await createReminderEvent(
                context.accessToken,
                owner.email,
                clientData.denominacion,
                original.title,
                endDate,
              );
            } catch (error) {
              console.error(`Failed to create calendar reminder for pautado ${pautado.id}:`, error);
            }
          }
        }
      }
    }
  }

  const detailsBase = {
    userId: context.userId,
    userName: context.userName,
    entityType: 'opportunity' as const,
    entityId: id,
    entityName: original.title,
    ownerName: context.ownerName,
  };

  if (data.stage && data.stage !== original.stage) {
    await logActivity({
      ...detailsBase,
      type: 'stage_change',
      details: `cambió la etapa de <strong>${original.title}</strong> a <strong>${data.stage}</strong> para el cliente <a href="/clients/${original.clientId}" class="font-bold text-primary hover:underline">${original.clientName}</a>`,
    });
  } else {
    await logActivity({
      ...detailsBase,
      type: 'update',
      details: `actualizó la oportunidad <strong>${original.title}</strong> para el cliente <a href="/clients/${original.clientId}" class="font-bold text-primary hover:underline">${original.clientName}</a>`,
    });
  }
}

export async function deleteOpportunity(
  id: string,
  context: OpportunityMutationContext,
): Promise<void> {
  const docRef = opportunitiesCollection.doc(id);
  const snapshot = await docRef.get();
  if (!snapshot.exists) {
    throw new Error('Opportunity not found');
  }
  const opportunityData = snapshot.data() as Opportunity;

  const batch = adminDb.batch();
  batch.delete(docRef);

  const invoicesSnap = await invoicesCollection.where('opportunityId', '==', id).get();
  invoicesSnap.forEach((doc) => batch.delete(doc.ref));

  await batch.commit();

  const clientSnap = await clientsCollection.doc(opportunityData.clientId).get();
  const clientOwnerName = clientSnap.exists ? (clientSnap.data() as Client).ownerName : 'N/A';

  await logActivity({
    userId: context.userId,
    userName: context.userName,
    type: 'delete',
    entityType: 'opportunity',
    entityId: id,
    entityName: opportunityData.title,
    details: `eliminó la oportunidad <strong>${opportunityData.title}</strong> del cliente ${opportunityData.clientName}`,
    ownerName: clientOwnerName,
  });
}
