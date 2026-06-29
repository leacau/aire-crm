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

function firebaseAdminEnvironmentSummary() {
  return {
    runtime: process.env.NETLIFY ? 'netlify' : process.env.VERCEL ? 'vercel' : process.env.NODE_ENV || 'unknown',
    hasServiceAccountKey: Boolean(
      process.env.FIREBASE_SERVICE_ACCOUNT_KEY ||
      process.env.FIREBASE_SERVICE_ACCOUNT ||
      process.env.FIREBASE_ADMIN_SERVICE_ACCOUNT ||
      process.env.FIREBASE_ADMIN_CREDENTIALS ||
      process.env.GOOGLE_APPLICATION_CREDENTIALS_JSON ||
      process.env.GOOGLE_CREDENTIALS
    ),
    hasSeparatedCredentials: Boolean(
      (process.env.FIREBASE_ADMIN_CLIENT_EMAIL || process.env.FIREBASE_CLIENT_EMAIL || process.env.GOOGLE_CLIENT_EMAIL) &&
      (process.env.FIREBASE_ADMIN_PRIVATE_KEY || process.env.FIREBASE_PRIVATE_KEY || process.env.GOOGLE_PRIVATE_KEY)
    ),
    hasProjectId: Boolean(
      process.env.FIREBASE_ADMIN_PROJECT_ID ||
      process.env.FIREBASE_PROJECT_ID ||
      process.env.GOOGLE_CLOUD_PROJECT ||
      process.env.GCLOUD_PROJECT ||
      process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID
    ),
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
    normalizedMessage.includes('could not load the default credentials') ||
    normalizedMessage.includes('application default credentials') ||
    normalizedMessage.includes('google application credentials')
  ) {
    return NextResponse.json(
      {
        error: 'No se encontraron credenciales Firebase Admin en el servidor.',
        code: 'FIREBASE_ADMIN_MISSING_CREDENTIALS',
        details: firebaseAdminEnvironmentSummary(),
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
        details: {
          firebaseCode: code || 'invalid-credentials',
          environment: firebaseAdminEnvironmentSummary(),
        },
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

  if (
    normalizedCode.includes('deadline-exceeded') ||
    normalizedCode.includes('unavailable') ||
    normalizedCode.includes('resource-exhausted') ||
    normalizedMessage.includes('deadline exceeded') ||
    normalizedMessage.includes('service unavailable') ||
    normalizedMessage.includes('quota')
  ) {
    return NextResponse.json(
      {
        error: 'Firestore no pudo completar la consulta en este momento.',
        code: 'FIRESTORE_UNAVAILABLE',
        details: code || message || 'unavailable',
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
