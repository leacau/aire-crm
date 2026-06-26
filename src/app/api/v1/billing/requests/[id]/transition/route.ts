import { NextResponse } from 'next/server';

import { apiErrorResponse } from '@/lib/server/api-error';
import { isServerResponse, requireServerCapability } from '@/lib/server/auth';
import { billingRequestTransitionSchema } from '@/modules/billing/application/billing-request-schemas';
import { transitionBillingRequestOnServer } from '@/modules/billing/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type RouteContext = { params: Promise<{ id: string }> };

export async function POST(request: Request, { params }: RouteContext) {
  const user = await requireServerCapability(request, 'billing.update');
  if (isServerResponse(user)) return user;

  try {
    const { id } = await params;
    const input = billingRequestTransitionSchema.parse(await request.json());
    await transitionBillingRequestOnServer(id, input, user);
    return NextResponse.json({ data: { id } });
  } catch (error) {
    return apiErrorResponse(error);
  }
}
