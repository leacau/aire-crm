import { NextResponse } from 'next/server';
import { authAdmin, dbAdmin } from '@/lib/firebase-admin';
import type { ScreenName, ScreenPermission } from '@/lib/types';

export type ServerUser = {
  uid: string;
  email?: string;
  name?: string;
  role?: string;
  area?: string;
  permissions?: Partial<Record<ScreenName, ScreenPermission>>;
  sellerConfig?: Array<{ companyName: string; codes: string[] }>;
};

export function getBearerToken(request: Request): string | null {
  const header = request.headers.get('authorization') || request.headers.get('Authorization');
  if (!header?.startsWith('Bearer ')) return null;
  return header.slice('Bearer '.length).trim() || null;
}

export async function requireServerUser(request: Request): Promise<ServerUser | NextResponse> {
  const token = getBearerToken(request);
  if (!token) {
    return NextResponse.json({ error: 'Missing authentication token' }, { status: 401 });
  }

  let decoded: Awaited<ReturnType<typeof authAdmin.verifyIdToken>>;
  try {
    decoded = await authAdmin.verifyIdToken(token);
  } catch (error: any) {
    console.error('SERVER AUTH TOKEN ERROR:', {
      code: error?.code,
      message: error?.message,
    });
    return NextResponse.json({ error: 'Invalid authentication token' }, { status: 401 });
  }

  try {
    const userSnap = await dbAdmin.collection('users').doc(decoded.uid).get();
    const profile = userSnap.exists ? userSnap.data() : {};

    return {
      uid: decoded.uid,
      email: decoded.email,
      name: profile?.name,
      role: profile?.role,
      area: profile?.area,
      permissions: profile?.permissions || {},
      sellerConfig: profile?.sellerConfig || [],
    };
  } catch (error: any) {
    console.error('SERVER USER PROFILE FALLBACK:', {
      uid: decoded.uid,
      code: error?.code,
      message: error?.message,
    });

    return {
      uid: decoded.uid,
      email: decoded.email,
      name: decoded.name,
      permissions: {},
      sellerConfig: [],
    };
  }
}

export function isServerResponse(value: ServerUser | NextResponse): value is NextResponse {
  return value instanceof NextResponse;
}

export function hasServerManagementPrivileges(user: ServerUser): boolean {
  if (user.email?.toLowerCase() === 'lchena@airedesantafe.com.ar') return true;
  return user.role === 'Jefe' || user.role === 'Gerencia' || user.role === 'Administracion' || user.role === 'Admin';
}

export async function requireServerManagement(request: Request): Promise<ServerUser | NextResponse> {
  const user = await requireServerUser(request);
  if (isServerResponse(user)) return user;
  if (!hasServerManagementPrivileges(user)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }
  return user;
}
