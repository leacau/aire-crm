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

  console.error('Unhandled API error:', error);
  return NextResponse.json(
    { error: 'Ocurrió un error interno.', code: 'INTERNAL_ERROR' },
    { status: 500 },
  );
}
