'use client';

import { apiRequest } from '@/lib/api-client';
import { sendEmail } from '@/lib/api/google-services';
import { getWorkflowAssignments } from '@/lib/api/system';
import { getUserById } from '@/lib/api/users';
import { format } from 'date-fns';
import type { BillingRequest } from '@/lib/types';

export type BillingRequestWithMetadata = BillingRequest & {
  accountExecutive: string;
  advisorId: string;
  opportunityTitle: string;
  clientDisplayName: string;
  cuit: string;
  billingStatus: 'Sugerido' | 'Solicitado' | 'Elevado' | 'Confeccionado';
  invoiceNumber: string;
};

export async function getAllBillingRequestsWithMetadata(): Promise<BillingRequestWithMetadata[]> {
  const result = await apiRequest<{ requests: BillingRequestWithMetadata[] }>('/api/billing-requests', {
    method: 'GET',
  });
  return result.requests;
}

export async function getBillingRequestsByOrder(orderId: string): Promise<BillingRequest[]> {
  const result = await apiRequest<{ billingRequests: BillingRequest[] }>(
    `/api/billing-requests/order/${encodeURIComponent(orderId)}`,
    { method: 'GET' },
  );
  return result.billingRequests;
}

export async function updateBillingRequestStatus(
  requestId: string,
  newStatus: 'Sugerido' | 'Solicitado' | 'Elevado' | 'Confeccionado',
  metadata?: { invoiceNumber?: string; emailPayload?: { accessToken: string; loggedUser: string } },
): Promise<void> {
  await apiRequest<{ ok: true }>(`/api/billing-requests/${encodeURIComponent(requestId)}`, {
    method: 'PATCH',
    body: { billingStatus: newStatus, invoiceNumber: metadata?.invoiceNumber },
  });

  if (!metadata?.emailPayload?.accessToken) return;

  try {
    const allData = await getAllBillingRequestsWithMetadata();
    const fullRequest = allData.find(request => request.id === requestId);
    if (!fullRequest) return;

    const configAssignments = await getWorkflowAssignments();
    let recipients: string[] = [];
    let emailSubject = '';
    let emailBody = '';

    let formattedDate = fullRequest.date;
    try {
      formattedDate = format(new Date(`${fullRequest.date}T12:00:00`), 'dd/MM/yyyy');
    } catch {
      formattedDate = fullRequest.date;
    }

    if (newStatus === 'Solicitado') {
      emailSubject = `Nuevo pedido factura - ${fullRequest.company} - ${fullRequest.clientDisplayName}`;
      for (const id of configAssignments.billingReceptors) {
        const user = await getUserById(id);
        if (user?.email && !recipients.includes(user.email)) recipients.push(user.email);
      }

      emailBody = `
        <div style="font-family: Arial, sans-serif; color: #333; max-width: 600px; border: 1px solid #cbd5e1; padding: 20px; border-radius: 8px;">
          <h2 style="color: #1d4ed8; border-bottom: 2px solid #1d4ed8; padding-bottom: 8px;">Nuevo Pedido de Facturacion Entrante</h2>
          <p>El asesor <strong>${fullRequest.accountExecutive}</strong> solicita la validacion del siguiente item:</p>
          <p><strong>Anunciante:</strong> ${fullRequest.clientDisplayName}<br/><strong>Monto Neto:</strong> $${Number(fullRequest.amount).toLocaleString('es-AR')}<br/><strong>Empresa:</strong> ${fullRequest.company}</p>
          <p>Ingresa a la bandeja de Pedidos Realizados para evaluarlo y elevarlo a contaduria.</p>
        </div>
      `;
    } else if (newStatus === 'Elevado') {
      emailSubject = `Solicitud factura Tango - ${fullRequest.company} - ${fullRequest.clientDisplayName}`;
      recipients = ['lchena@airedesantafe.com.ar'];

      for (const id of configAssignments.tangoInvoicers) {
        const user = await getUserById(id);
        if (user?.email && !recipients.includes(user.email)) recipients.push(user.email);
      }

      emailBody = `
        <div style="font-family: Arial, sans-serif; color: #333; max-width: 600px; border: 1px solid #cbd5e1; padding: 20px; border-radius: 8px;">
          <h2 style="color: #b45309; border-bottom: 2px solid #b45309; padding-bottom: 8px;">Pedido de Facturacion Elevado</h2>
          <p>El coordinador <strong>${metadata.emailPayload.loggedUser}</strong> solicita confeccionar la siguiente factura en Tango:</p>
          <table style="width: 100%; border-collapse: collapse; margin: 20px 0; font-size: 13px;">
            <tr><td style="padding: 6px; font-weight: bold; background: #f8fafc;">Anunciante:</td><td style="padding: 6px; background: #f8fafc;">${fullRequest.clientDisplayName}</td></tr>
            <tr><td style="padding: 6px; font-weight: bold;">CUIT:</td><td style="padding: 6px;">${fullRequest.cuit}</td></tr>
            <tr><td style="padding: 6px; font-weight: bold; background: #f8fafc;">Empresa:</td><td style="padding: 6px; background: #f8fafc; font-weight: bold;">${fullRequest.company}</td></tr>
            <tr><td style="padding: 6px; font-weight: bold;">Fecha Progr:</td><td style="padding: 6px;">${formattedDate}</td></tr>
            <tr><td style="padding: 6px; font-weight: bold; background: #f8fafc;">Monto Neto:</td><td style="padding: 6px; background: #f8fafc; font-weight: bold; color: #15803d;">$${Number(fullRequest.amount).toLocaleString('es-AR')}</td></tr>
            <tr><td style="padding: 6px; font-weight: bold;">Condicion:</td><td style="padding: 6px;">${fullRequest.paymentType || 'Se paga'} ${fullRequest.canjeDescription ? `(${fullRequest.canjeDescription})` : ''}</td></tr>
          </table>
        </div>
      `;
    } else if (newStatus === 'Confeccionado') {
      emailSubject = `Factura disponible - ${fullRequest.clientDisplayName}`;

      if (fullRequest.advisorId) {
        const sellerProfile = await getUserById(fullRequest.advisorId);
        if (sellerProfile?.email) recipients.push(sellerProfile.email);
      }
      if (recipients.length === 0) recipients.push('lchena@airedesantafe.com.ar');

      emailBody = `
        <div style="font-family: Arial, sans-serif; color: #333; max-width: 600px; border: 1px solid #cbd5e1; padding: 20px; border-radius: 8px;">
          <h2 style="color: #15803d; border-bottom: 2px solid #15803d; padding-bottom: 8px;">Factura Confeccionada Correctamente</h2>
          <p>Hola <strong>${fullRequest.accountExecutive}</strong>,</p>
          <p>Administracion informa que ya se emitio el comprobante oficial en Tango para tu cliente:</p>
          <p><strong>Anunciante:</strong> ${fullRequest.clientDisplayName}<br/>
          <strong>Importe Neto:</strong> $${Number(fullRequest.amount).toLocaleString('es-AR')}<br/>
          <strong>Numero de factura asignado:</strong> <span style="font-family: monospace; font-size: 14px; background: #e1faf0; padding: 2px 6px; border-radius: 4px; font-weight: bold; color: #16a34a;">${metadata.invoiceNumber}</span></p>
          <p>Ya puedes consultar el registro cerrado desde tu panel de facturas confeccionadas.</p>
        </div>
      `;
    }

    if (recipients.length > 0 && emailBody) {
      await sendEmail({
        accessToken: metadata.emailPayload.accessToken,
        to: recipients,
        subject: emailSubject,
        body: emailBody,
      });
    }
  } catch (error) {
    console.error('Fallo controlado en el despachador de correos contables:', error);
  }
}
