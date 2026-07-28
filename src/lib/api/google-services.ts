'use client';

import { apiFetch } from '@/lib/api-client';

export interface EmailAttachment {
  filename: string;
  content: string;
  encoding?: 'base64' | string;
}

export interface EmailParams {
  accessToken?: string | null;
  to: string | string[];
  subject: string;
  body: string;
  attachments?: EmailAttachment[];
  fromName?: string;
  fromEmail?: string;
  replyTo?: string;
}

const EMAIL_REQUEST_TIMEOUT_MS = 60000;
const SERVER_EMAIL_PAYLOAD_LIMIT_BYTES = 3_500_000;

function cleanHeader(value: unknown): string {
  return String(value || '').replace(/[\r\n]/g, ' ').trim();
}

function formatMailbox(name: unknown, email: unknown): string {
  const safeEmail = cleanHeader(email);
  if (!safeEmail) return '';
  const safeName = cleanHeader(name).replace(/"/g, "'");
  return safeName ? `"${safeName}" <${safeEmail}>` : safeEmail;
}

function getJsonPayloadSize(value: unknown) {
  const json = JSON.stringify(value);
  if (typeof Blob !== 'undefined') {
    return new Blob([json]).size;
  }
  return json.length;
}

function toBase64UrlUtf8(value: string) {
  const bytes = new TextEncoder().encode(value);
  let binary = '';
  const chunkSize = 0x8000;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    const chunk = bytes.subarray(i, i + chunkSize);
    binary += String.fromCharCode(...chunk);
  }
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

async function sendEmailDirectlyWithGmail(params: EmailParams) {
  if (!params.accessToken) {
    throw new Error('No se puede enviar un correo grande sin acceso directo a Gmail.');
  }

  const safeTo = Array.isArray(params.to) ? params.to.map(cleanHeader).join(', ') : cleanHeader(params.to);
  const safeSubject = cleanHeader(params.subject);
  const safeReplyTo = cleanHeader(params.replyTo);
  const boundary = '__aire_crm_boundary__';
  const message: string[] = [];

  message.push('MIME-Version: 1.0');
  const formattedFrom = formatMailbox(params.fromName, params.fromEmail);
  if (formattedFrom) {
    message.push(`From: ${formattedFrom}`);
  }
  message.push(`To: ${safeTo}`);
  if (safeReplyTo) {
    message.push(`Reply-To: ${safeReplyTo}`);
  }
  message.push(`Subject: ${safeSubject}`);
  message.push(`Content-Type: multipart/mixed; boundary="${boundary}"`);
  message.push('');

  message.push(`--${boundary}`);
  message.push('Content-Type: text/html; charset="UTF-8"');
  message.push('Content-Transfer-Encoding: 7bit');
  message.push('');
  message.push(params.body);
  message.push('');

  for (const att of params.attachments || []) {
    const filename = cleanHeader(att.filename || 'attachment.pdf');
    const content = String(att.content || '');
    message.push(`--${boundary}`);
    message.push(`Content-Type: application/pdf; name="${filename}"`);
    message.push(`Content-Description: ${filename}`);
    message.push(`Content-Disposition: attachment; filename="${filename}"; size=${content.length}`);
    message.push('Content-Transfer-Encoding: base64');
    message.push('');
    message.push(content);
    message.push('');
  }

  message.push(`--${boundary}--`);

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), EMAIL_REQUEST_TIMEOUT_MS);

  try {
    const response = await fetch('https://www.googleapis.com/gmail/v1/users/me/messages/send', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${params.accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ raw: toBase64UrlUtf8(message.join('\r\n')) }),
      signal: controller.signal,
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`No se pudo enviar el correo por Gmail API: ${errorText}`);
    }

    return response.json();
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') {
      throw new Error('El envio directo por Gmail demoro demasiado y fue cancelado.');
    }
    throw error;
  } finally {
    clearTimeout(timeoutId);
  }
}

export type GoogleCalendarEvent = {
  id?: string;
  summary?: string;
  description?: string;
  start?: {
    date?: string;
    dateTime?: string;
  };
  end?: {
    date?: string;
    dateTime?: string;
  };
  [key: string]: unknown;
};

async function readServiceError(response: Response, fallback: string): Promise<Error & { code?: string }> {
  const errorText = await response.text();

  try {
    const payload = JSON.parse(errorText);
    const error = new Error(payload.error || payload.details || fallback) as Error & { code?: string };
    error.code = payload.code;
    return error;
  } catch {
    return new Error(errorText ? `${fallback}: ${errorText}` : fallback);
  }
}

export async function sendEmail(params: EmailParams) {
  if (
    params.accessToken &&
    params.attachments?.length &&
    getJsonPayloadSize(params) > SERVER_EMAIL_PAYLOAD_LIMIT_BYTES
  ) {
    return sendEmailDirectlyWithGmail(params);
  }

  const response = await apiFetch('/api/services/gmail/send', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(params),
  });

  if (!response.ok) {
    throw await readServiceError(response, 'No se pudo enviar el correo.');
  }

  return response.json();
}

export async function getCalendarEvents(
  accessToken: string,
  calendarId: string = 'primary',
): Promise<GoogleCalendarEvent[]> {
  const params = new URLSearchParams({ calendarId });
  const response = await apiFetch(`/api/services/calendar/events?${params.toString()}`, {
    method: 'GET',
    headers: {
      'x-google-access-token': accessToken,
    },
    cache: 'no-store',
  });

  if (!response.ok) {
    throw await readServiceError(response, 'No se pudieron cargar los eventos de Google Calendar.');
  }

  const payload = await response.json();
  return Array.isArray(payload.items) ? payload.items : [];
}

export async function createCalendarEvent(accessToken: string, event: object, calendarId: string = 'primary') {
  const response = await apiFetch('/api/services/calendar/events', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ accessToken, event, calendarId }),
  });

  if (!response.ok) {
    throw await readServiceError(response, 'No se pudo crear el evento en Google Calendar.');
  }

  return response.json();
}

export async function updateCalendarEvent(
  accessToken: string,
  eventId: string,
  event: object,
  calendarId: string = 'primary',
) {
  const response = await apiFetch(`/api/services/calendar/events/${eventId}`, {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ accessToken, event, calendarId }),
  });

  if (!response.ok) {
    throw await readServiceError(response, 'No se pudo actualizar el evento en Google Calendar.');
  }

  return response.json();
}

export async function deleteCalendarEvent(accessToken: string, eventId: string, calendarId: string = 'primary') {
  const response = await apiFetch(`/api/services/calendar/events/${eventId}`, {
    method: 'DELETE',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ accessToken, calendarId }),
  });

  if (!response.ok) {
    throw await readServiceError(response, 'No se pudo eliminar el evento en Google Calendar.');
  }

  return response.json();
}

export async function uploadAvatarToDrive(accessToken: string, file: File): Promise<string> {
  const formData = new FormData();
  formData.set('file', file);

  const response = await apiFetch('/api/services/drive/avatar', {
    method: 'POST',
    headers: {
      'x-google-access-token': accessToken,
    },
    body: formData,
  });

  if (!response.ok) {
    throw await readServiceError(response, 'No se pudo subir la imagen de perfil.');
  }

  const payload = await response.json();
  return payload.url;
}

export async function validateGoogleServicesAccess(accessToken: string): Promise<void> {
  const response = await apiFetch('/api/services/google/access-check', {
    method: 'POST',
    headers: {
      'x-google-access-token': accessToken,
    },
  });

  if (!response.ok) {
    throw await readServiceError(response, 'No se pudo validar el acceso a los servicios de Google.');
  }
}
