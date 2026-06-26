import { NextResponse, type NextResponse as NextResponseType } from 'next/server';

type JsonResponseInit = ResponseInit;

function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (!value || typeof value !== 'object') return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function hasFunction(value: object, key: string): boolean {
  return key in value && typeof (value as Record<string, unknown>)[key] === 'function';
}

export function toJsonSafeValue(value: unknown, seen = new WeakSet<object>()): unknown {
  if (value === null || value === undefined) return value;

  const valueType = typeof value;
  if (valueType === 'string' || valueType === 'number' || valueType === 'boolean') return value;
  if (valueType === 'bigint') return value.toString();
  if (valueType !== 'object') return undefined;

  const objectValue = value as object;

  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? undefined : value.toISOString();
  }

  if (seen.has(objectValue)) return undefined;
  seen.add(objectValue);

  if (Array.isArray(value)) {
    return value
      .map(entry => toJsonSafeValue(entry, seen))
      .filter(entry => entry !== undefined);
  }

  if (hasFunction(objectValue, 'toDate')) {
    try {
      const date = (value as { toDate: () => Date }).toDate();
      return Number.isNaN(date.getTime()) ? undefined : date.toISOString();
    } catch {
      return undefined;
    }
  }

  if (hasFunction(objectValue, 'isEqual') && 'path' in objectValue) {
    const reference = value as { id?: unknown; path?: unknown };
    return {
      id: typeof reference.id === 'string' ? reference.id : undefined,
      path: typeof reference.path === 'string' ? reference.path : undefined,
    };
  }

  if ('latitude' in objectValue && 'longitude' in objectValue) {
    const point = value as { latitude?: unknown; longitude?: unknown };
    if (typeof point.latitude === 'number' && typeof point.longitude === 'number') {
      return { latitude: point.latitude, longitude: point.longitude };
    }
  }

  if (Buffer.isBuffer(value)) {
    return value.toString('base64');
  }

  if (!isPlainObject(value)) {
    return String(value);
  }

  return Object.fromEntries(
    Object.entries(value)
      .map(([key, entry]) => [key, toJsonSafeValue(entry, seen)] as const)
      .filter(([, entry]) => entry !== undefined),
  );
}

export function jsonResponse(payload: unknown, init?: JsonResponseInit): NextResponseType {
  return NextResponse.json(toJsonSafeValue(payload), init);
}

export function jsonDataResponse(data: unknown, init?: JsonResponseInit): NextResponseType {
  return jsonResponse({ data }, init);
}
