import { format } from 'date-fns';
import { FieldValue } from 'firebase-admin/firestore';

import { DEFAULT_ORGANIZATION_ID } from '@/core/organizations/organization';
import { dbAdmin } from '@/lib/firebase-admin';
import { ApiError } from '@/lib/server/api-error';
import type { ServerUser } from '@/lib/server/auth';
import { hasServerManagementPrivileges } from '@/lib/server/auth';
import {
  canSeeBillingRequest,
  canTransitionBillingRequest,
  type BillingActor,
} from '../../application/billing-request-permissions';
import type { BillingRequestTransitionRequest } from '../../application/billing-request-schemas';
import type {
  BillingRequestStatus,
  BillingRequestWithMetadata,
} from '../../domain/billing-request';

type WorkflowAssignments = {
  billingReceptors: string[];
  tangoInvoicers: string[];
};

const billingRequestsCollection = dbAdmin.collection('billing_requests');
const advertisingOrdersCollection = dbAdmin.collection('advertising_orders');
const clientsCollection = dbAdmin.collection('clients');
const usersCollection = dbAdmin.collection('users');
const workflowAssignmentsDocument = dbAdmin.collection('system_config').doc('workflow_assignments');

function timestampToIso(value: unknown): string | undefined {
  if (!value) return undefined;
  if (typeof value === 'string') return value;
  if (typeof value === 'object' && value !== null && 'toDate' in value) {
    const toDate = (value as { toDate?: () => Date }).toDate;
    if (typeof toDate === 'function') return toDate.call(value).toISOString();
  }
  return undefined;
}

function belongsToOrganization(data: FirebaseFirestore.DocumentData | undefined, organizationId: string): boolean {
  if (!data?.organizationId) return organizationId === DEFAULT_ORGANIZATION_ID;
  return data.organizationId === organizationId;
}

function serializeBillingRequest(
  id: string,
  data: FirebaseFirestore.DocumentData,
  order?: FirebaseFirestore.DocumentData,
  client?: FirebaseFirestore.DocumentData,
): BillingRequestWithMetadata {
  return {
    ...data,
    id,
    billingStatus: data.billingStatus || 'Sugerido',
    invoiceNumber: data.invoiceNumber || '',
    createdAt: timestampToIso(data.createdAt),
    updatedAt: timestampToIso(data.updatedAt),
    accountExecutive: order?.accountExecutive || 'Sistema',
    advisorId: order?.createdBy || '',
    opportunityTitle: order?.opportunityTitle || order?.product || 'Campaña',
    clientDisplayName: client?.razonSocialTango || client?.razonSocial || client?.denominacion || 'Desconocido',
    cuit: client?.cuit || '-',
  } as BillingRequestWithMetadata;
}

async function getWorkflowAssignments(): Promise<WorkflowAssignments> {
  const snapshot = await workflowAssignmentsDocument.get();
  const data = snapshot.exists ? snapshot.data() || {} : {};
  return {
    billingReceptors: Array.isArray(data.billingReceptors) ? data.billingReceptors : [],
    tangoInvoicers: Array.isArray(data.tangoInvoicers) ? data.tangoInvoicers : [],
  };
}

async function getActor(user: ServerUser): Promise<BillingActor> {
  const assignments = await getWorkflowAssignments();
  return {
    uid: user.uid,
    isBillingReceptor: assignments.billingReceptors.includes(user.uid),
    isManager: hasServerManagementPrivileges(user),
  };
}

async function listAllBillingRequestsForOrganization(organizationId: string): Promise<BillingRequestWithMetadata[]> {
  const [requestsSnapshot, ordersSnapshot, clientsSnapshot] = await Promise.all([
    billingRequestsCollection.get(),
    advertisingOrdersCollection.get(),
    clientsCollection.get(),
  ]);

  const orders = new Map(ordersSnapshot.docs
    .filter(document => belongsToOrganization(document.data(), organizationId))
    .map(document => [document.id, document.data()]));
  const clients = new Map(clientsSnapshot.docs
    .filter(document => belongsToOrganization(document.data(), organizationId))
    .map(document => [document.id, document.data()]));

  return requestsSnapshot.docs
    .map(document => {
      const data = document.data();
      return {
        document,
        data,
        order: data.orderId ? orders.get(data.orderId) : undefined,
        client: data.clientId ? clients.get(data.clientId) : undefined,
      };
    })
    .filter(({ data, order, client }) => {
      if (data.organizationId) return data.organizationId === organizationId;
      if (order?.organizationId) return order.organizationId === organizationId;
      if (client?.organizationId) return client.organizationId === organizationId;
      return organizationId === DEFAULT_ORGANIZATION_ID;
    })
    .map(({ document, data, order, client }) => serializeBillingRequest(document.id, data, order, client))
    .sort((left, right) => String(left.date || '').localeCompare(String(right.date || '')));
}

export async function listBillingRequestsForUser(user: ServerUser): Promise<BillingRequestWithMetadata[]> {
  const [actor, requests] = await Promise.all([
    getActor(user),
    listAllBillingRequestsForOrganization(user.organizationId),
  ]);

  return requests.filter(request => canSeeBillingRequest(actor, request));
}

export async function getBillingRequestContextForUser(user: ServerUser) {
  const actor = await getActor(user);
  return {
    isBillingReceptor: actor.isBillingReceptor,
    canManageAllBillingRequests: actor.isManager,
  };
}

async function getBillingRequestForUser(id: string, user: ServerUser) {
  const [actor, requests, snapshot] = await Promise.all([
    getActor(user),
    listAllBillingRequestsForOrganization(user.organizationId),
    billingRequestsCollection.doc(id).get(),
  ]);
  const request = requests.find(item => item.id === id);
  if (!snapshot.exists || !request) {
    throw new ApiError(404, 'El pedido de facturación no existe.', 'BILLING_REQUEST_NOT_FOUND');
  }
  if (!canSeeBillingRequest(actor, request)) {
    throw new ApiError(403, 'No puedes ver este pedido de facturación.', 'BILLING_REQUEST_FORBIDDEN');
  }
  return { actor, request, snapshot };
}

export async function transitionBillingRequestOnServer(
  id: string,
  input: BillingRequestTransitionRequest,
  user: ServerUser,
): Promise<void> {
  const { actor, request, snapshot } = await getBillingRequestForUser(id, user);
  if (!canTransitionBillingRequest(actor, request, input.status)) {
    throw new ApiError(403, 'No puedes realizar esta transición de facturación.', 'BILLING_REQUEST_TRANSITION_FORBIDDEN');
  }

  const update: Record<string, unknown> = {
    billingStatus: input.status,
    updatedAt: FieldValue.serverTimestamp(),
  };
  if (input.invoiceNumber?.trim()) update.invoiceNumber = input.invoiceNumber.trim();

  await snapshot.ref.update(update);

  if (input.emailPayload?.accessToken) {
    await sendBillingRequestNotification({
      request: {
        ...request,
        billingStatus: input.status,
        invoiceNumber: input.invoiceNumber?.trim() || request.invoiceNumber,
      },
      status: input.status,
      accessToken: input.emailPayload.accessToken,
      loggedUser: input.emailPayload.loggedUser || user.name,
    }).catch(error => {
      console.error('Fallo controlado en el despachador de correos contables:', error);
    });
  }
}

async function getUserEmail(userId: string): Promise<string | undefined> {
  const snapshot = await usersCollection.doc(userId).get();
  const email = snapshot.exists ? snapshot.data()?.email : undefined;
  return typeof email === 'string' && email.includes('@') ? email : undefined;
}

async function uniqueEmailsForUsers(userIds: string[]): Promise<string[]> {
  const emails = await Promise.all(userIds.map(getUserEmail));
  return [...new Set(emails.filter((email): email is string => Boolean(email)))];
}

function formatBillingDate(value?: string): string {
  if (!value) return '-';
  try {
    return format(new Date(`${value}T12:00:00`), 'dd/MM/yyyy');
  } catch {
    return value;
  }
}

function formatAmount(value?: number): string {
  return Number(value || 0).toLocaleString('es-AR');
}

async function sendBillingRequestNotification(params: {
  request: BillingRequestWithMetadata;
  status: BillingRequestStatus;
  accessToken: string;
  loggedUser: string;
}) {
  const assignments = await getWorkflowAssignments();
  const { request, status } = params;
  let recipients: string[] = [];
  let subject = '';
  let body = '';

  if (status === 'Solicitado') {
    recipients = await uniqueEmailsForUsers(assignments.billingReceptors);
    subject = `NUEVO PEDIDO FACTURA - ${request.company || '-'} - ${request.clientDisplayName}`;
    body = `
      <div style="font-family: Arial, sans-serif; color: #333; max-width: 600px; border: 1px solid #cbd5e1; padding: 20px; border-radius: 8px;">
        <h2 style="color: #1d4ed8; border-bottom: 2px solid #1d4ed8; padding-bottom: 8px;">Nuevo Pedido de Facturación Entrante</h2>
        <p>El asesor <strong>${request.accountExecutive}</strong> solicita la validación del siguiente ítem:</p>
        <p><strong>Anunciante:</strong> ${request.clientDisplayName}<br/><strong>Monto Neto:</strong> $${formatAmount(request.amount)}<br/><strong>Empresa:</strong> ${request.company || '-'}</p>
        <p>Ingresá a la bandeja de Pedidos Realizados para evaluarlo y elevarlo a contaduría.</p>
      </div>
    `;
  } else if (status === 'Elevado') {
    recipients = ['lchena@airedesantafe.com.ar', ...(await uniqueEmailsForUsers(assignments.tangoInvoicers))];
    recipients = [...new Set(recipients)];
    subject = `SOLICITUD FACTURA TANGO - ${request.company || '-'} - ${request.clientDisplayName}`;
    body = `
      <div style="font-family: Arial, sans-serif; color: #333; max-width: 600px; border: 1px solid #cbd5e1; padding: 20px; border-radius: 8px;">
        <h2 style="color: #b45309; border-bottom: 2px solid #b45309; padding-bottom: 8px;">Pedido de Facturación Elevado</h2>
        <p>El coordinador <strong>${params.loggedUser}</strong> solicita confeccionar la siguiente factura en Tango:</p>
        <table style="width: 100%; border-collapse: collapse; margin: 20px 0; font-size: 13px;">
          <tr><td style="padding: 6px; font-weight: bold; background: #f8fafc;">Anunciante:</td><td style="padding: 6px; background: #f8fafc;">${request.clientDisplayName}</td></tr>
          <tr><td style="padding: 6px; font-weight: bold;">CUIT:</td><td style="padding: 6px;">${request.cuit}</td></tr>
          <tr><td style="padding: 6px; font-weight: bold; background: #f8fafc;">Empresa:</td><td style="padding: 6px; background: #f8fafc; font-weight: bold;">${request.company || '-'}</td></tr>
          <tr><td style="padding: 6px; font-weight: bold;">Fecha Progr:</td><td style="padding: 6px;">${formatBillingDate(request.date)}</td></tr>
          <tr><td style="padding: 6px; font-weight: bold; background: #f8fafc;">Monto Neto:</td><td style="padding: 6px; background: #f8fafc; font-weight: bold; color: #15803d;">$${formatAmount(request.amount)}</td></tr>
          <tr><td style="padding: 6px; font-weight: bold;">Condición:</td><td style="padding: 6px;">${request.paymentType || 'Se paga'} ${request.canjeDescription ? `(${request.canjeDescription})` : ''}</td></tr>
        </table>
      </div>
    `;
  } else if (status === 'Confeccionado') {
    const advisorEmail = request.advisorId ? await getUserEmail(request.advisorId) : undefined;
    recipients = advisorEmail ? [advisorEmail] : ['lchena@airedesantafe.com.ar'];
    subject = `FACTURA DISPONIBLE - ${request.clientDisplayName}`;
    body = `
      <div style="font-family: Arial, sans-serif; color: #333; max-width: 600px; border: 1px solid #cbd5e1; padding: 20px; border-radius: 8px;">
        <h2 style="color: #15803d; border-bottom: 2px solid #15803d; padding-bottom: 8px;">Factura Confeccionada Correctamente</h2>
        <p>Hola <strong>${request.accountExecutive}</strong>,</p>
        <p>Administración informa que ya se ha emitido el comprobante oficial en Tango para tu cliente:</p>
        <p><strong>Anunciante:</strong> ${request.clientDisplayName}<br/>
        <strong>Importe Neto:</strong> $${formatAmount(request.amount)}<br/>
        <strong>NÚMERO DE FACTURA ASIGNADO:</strong> <span style="font-family: monospace; font-size: 14px; background: #e1faf0; padding: 2px 6px; border-radius: 4px; font-weight: bold; color: #16a34a;">${request.invoiceNumber || ''}</span></p>
        <p>Ya podés consultar el registro cerrado desde tu panel de facturas confeccionadas.</p>
      </div>
    `;
  }

  if (recipients.length === 0 || !body) return;
  await sendGmail({
    accessToken: params.accessToken,
    to: recipients,
    subject,
    body,
  });
}

function cleanHeader(value: unknown): string {
  return String(value || '').replace(/[\r\n]/g, ' ').trim();
}

async function sendGmail(params: { accessToken: string; to: string[]; subject: string; body: string }) {
  const boundary = '__aire_crm_boundary__';
  const message = [
    'MIME-Version: 1.0',
    `To: ${params.to.map(cleanHeader).join(', ')}`,
    `Subject: ${cleanHeader(params.subject)}`,
    `Content-Type: multipart/mixed; boundary="${boundary}"`,
    '',
    `--${boundary}`,
    'Content-Type: text/html; charset="UTF-8"',
    'Content-Transfer-Encoding: 7bit',
    '',
    params.body,
    '',
    `--${boundary}--`,
  ];

  const raw = Buffer.from(message.join('\r\n')).toString('base64url');
  const response = await fetch('https://www.googleapis.com/gmail/v1/users/me/messages/send', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${params.accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ raw }),
  });

  if (!response.ok) {
    const details = await response.text();
    throw new Error(`Gmail rechazó el envío: ${details}`);
  }
}
