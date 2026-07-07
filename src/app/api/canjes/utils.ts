import { FieldValue } from 'firebase-admin/firestore';
import { serializeDocument } from '@/lib/server/firestore';
import type { Canje, HistorialMensualItem, Invoice } from '@/lib/types';

export function normalizeDateOnly(value: unknown): string | undefined {
  if (!value) return undefined;
  if (typeof value === 'string') return value.slice(0, 10);
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  if (typeof value === 'object' && 'toDate' in value && typeof value.toDate === 'function') {
    return value.toDate().toISOString().slice(0, 10);
  }
  return undefined;
}

export function normalizeCanjeHistoryItem(item: HistorialMensualItem): HistorialMensualItem {
  return {
    ...item,
    fechaEstado: normalizeDateOnly(item.fechaEstado) || item.fechaEstado,
    fechaCulminacion: normalizeDateOnly(item.fechaCulminacion),
  };
}

export function mapCanje(id: string, data: FirebaseFirestore.DocumentData | undefined): Canje {
  const canje = serializeDocument<Canje>(id, data);
  return {
    ...canje,
    fechaResolucion: normalizeDateOnly(canje.fechaResolucion),
    fechaCulminacion: normalizeDateOnly(canje.fechaCulminacion),
    historialMensual: canje.historialMensual
      ?.map(normalizeCanjeHistoryItem)
      .sort((a, b) => b.mes.localeCompare(a.mes)),
  };
}

export function cleanCanjeCreatePayload(payload: Record<string, unknown>) {
  const cleaned = Object.fromEntries(
    Object.entries(payload).filter(([key, value]) => key !== 'id' && value !== undefined),
  );
  delete cleaned.fechaCreacion;
  return cleaned;
}

export function cleanCanjeUpdatePayload(payload: Record<string, unknown>, deleteKeys: string[] = []) {
  const cleaned = Object.fromEntries(
    Object.entries(payload).filter(([key]) => key !== 'id'),
  );

  deleteKeys.forEach(key => {
    if (key !== 'id') {
      cleaned[key] = FieldValue.delete();
    }
  });

  for (const [key, value] of Object.entries(cleaned)) {
    if (value === undefined) {
      cleaned[key] = FieldValue.delete();
    }
  }

  if (Array.isArray(cleaned.historialMensual)) {
    cleaned.historialMensual = cleaned.historialMensual.map((item: HistorialMensualItem) => ({
      ...item,
      fechaEstado: item.fechaEstado ? new Date(item.fechaEstado).toISOString() : item.fechaEstado,
      fechaCulminacion: item.fechaCulminacion ? new Date(item.fechaCulminacion).toISOString() : item.fechaCulminacion,
    }));
  }

  return cleaned;
}

export function normalizeInvoiceAmount(rawAmount: unknown): number {
  if (typeof rawAmount === 'number' && Number.isFinite(rawAmount)) return rawAmount;
  if (typeof rawAmount === 'string') {
    const parsed = Number(rawAmount.replace(/\s+/g, '').replace(',', '.'));
    return Number.isFinite(parsed) ? parsed : 0;
  }
  const fallback = Number(rawAmount ?? 0);
  return Number.isFinite(fallback) ? fallback : 0;
}

export function mapInvoice(id: string, data: FirebaseFirestore.DocumentData | undefined): Invoice {
  const invoice = serializeDocument<Invoice>(id, data);
  return {
    ...invoice,
    amount: normalizeInvoiceAmount(invoice.amount),
    isCreditNote: Boolean(invoice.isCreditNote),
  };
}
