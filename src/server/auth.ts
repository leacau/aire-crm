import type {DecodedIdToken} from 'firebase-admin/auth';
import type {NextRequest} from 'next/server';

import {verifyIdToken} from './firebase-admin';

const BEARER_PREFIX = 'Bearer ';

type SupportedRequest = Request | NextRequest;

export class UnauthorizedError extends Error {
  status: number;

  constructor(message = 'Unauthorized') {
    super(message);
    this.name = 'UnauthorizedError';
    this.status = 401;
  }
}

function extractToken(request: SupportedRequest): string | null {
  const authorizationHeader = request.headers.get('authorization');

  if (!authorizationHeader) {
    return null;
  }

  const trimmed = authorizationHeader.trim();
  if (!trimmed.toLowerCase().startsWith(BEARER_PREFIX.toLowerCase())) {
    return null;
  }

  const token = trimmed.slice(BEARER_PREFIX.length).trim();
  return token.length > 0 ? token : null;
}

export async function assertAuthenticated(request: SupportedRequest): Promise<DecodedIdToken> {
  const token = extractToken(request);
  if (!token) {
    throw new UnauthorizedError();
  }

  try {
    return await verifyIdToken(token);
  } catch (error) {
    throw new UnauthorizedError();
  }
}

export async function getUserFromRequest(request: SupportedRequest): Promise<DecodedIdToken | null> {
  const token = extractToken(request);
  if (!token) {
    return null;
  }

  try {
    return await verifyIdToken(token);
  } catch (error) {
    return null;
  }
}
