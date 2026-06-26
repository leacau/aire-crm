import { NextResponse } from 'next/server';
import { ZodError } from 'zod';

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    message: string,
    public readonly code: string,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

function getErrorDetails(error: unknown): { code?: string; message?: string } {
  if (!error || typeof error !== 'object') return {};
  const candidate = error as { code?: unknown; message?: unknown };
  return {
    code: typeof candidate.code === 'string' ? candidate.code : undefined,
    message: typeof candidate.message === 'string' ? candidate.message : undefined,
  };
}

function firebaseInfrastructureErrorResponse(error: unknown): NextResponse | null {
  const { code, message } = getErrorDetails(error);
  const normalizedCode = code?.toLowerCase() || '';
  const normalizedMessage = message?.toLowerCase() || '';

  if (
    normalizedCode.includes('permission-denied') ||
    normalizedCode.includes('unauthenticated') ||
    normalizedMessage.includes('permission_denied') ||
    normalizedMessage.includes('missing or insufficient permissions')
  ) {
    return NextResponse.json(
      {
        error: 'Firebase Admin no tiene permisos para leer la base de datos.',
        code: 'FIREBASE_ADMIN_PERMISSION_DENIED',
        details: code || 'permission-denied',
      },
      { status: 500 },
    );
  }

  if (
    normalizedCode.includes('invalid-credential') ||
    normalizedCode.includes('invalid-grant') ||
    normalizedCode.includes('invalid-app-options') ||
    normalizedMessage.includes('private key') ||
    normalizedMessage.includes('service account') ||
    normalizedMessage.includes('credential')
  ) {
    return NextResponse.json(
      {
        error: 'Las credenciales Firebase Admin del servidor no son válidas.',
        code: 'FIREBASE_ADMIN_INVALID_CREDENTIALS',
        details: code || 'invalid-credentials',
      },
      { status: 500 },
    );
  }

  if (
    normalizedCode.includes('failed-precondition') ||
    normalizedMessage.includes('index') ||
    normalizedMessage.includes('requires an index')
  ) {
    return NextResponse.json(
      {
        error: 'Firestore requiere un índice para esta consulta.',
        code: 'FIRESTORE_INDEX_REQUIRED',
        details: code || 'failed-precondition',
      },
      { status: 500 },
    );
  }

  if (
    normalizedCode.includes('not-found') ||
    normalizedMessage.includes('database') && normalizedMessage.includes('not found')
  ) {
    return NextResponse.json(
      {
        error: 'No se encontró la base de datos Firestore configurada para el servidor.',
        code: 'FIRESTORE_DATABASE_NOT_FOUND',
        details: code || 'not-found',
      },
      { status: 500 },
    );
  }

  return null;
}

function dataShapeErrorResponse(error: unknown): NextResponse | null {
  const { message } = getErrorDetails(error);
  const normalizedMessage = message?.toLowerCase() || '';

  if (
    error instanceof TypeError &&
    (
      normalizedMessage.includes('tolowercase') ||
      normalizedMessage.includes('localecompare') ||
      normalizedMessage.includes('toisostring') ||
      normalizedMessage.includes('date.parse') ||
      normalizedMessage.includes('is not a function')
    )
  ) {
    return NextResponse.json(
      {
        error: 'Hay un dato histórico con formato inesperado que impide armar el listado.',
        code: 'DATA_SHAPE_ERROR',
        details: message,
      },
      { status: 500 },
    );
  }

  return null;
}

export function apiErrorResponse(error: unknown): NextResponse {
  if (error instanceof ApiError) {
    return NextResponse.json(
      { error: error.message, code: error.code },
      { status: error.status },
    );
  }

  if (error instanceof ZodError) {
    return NextResponse.json(
      {
        error: 'Los datos enviados no son válidos.',
        code: 'VALIDATION_ERROR',
        details: error.flatten(),
      },
      { status: 400 },
    );
  }

  const firebaseResponse = firebaseInfrastructureErrorResponse(error);
  if (firebaseResponse) return firebaseResponse;

  const dataShapeResponse = dataShapeErrorResponse(error);
  if (dataShapeResponse) return dataShapeResponse;

  console.error('Unhandled API error:', error);
  return NextResponse.json(
    { error: 'Ocurrió un error interno.', code: 'INTERNAL_ERROR' },
    { status: 500 },
  );
}
