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
