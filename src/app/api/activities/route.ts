import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';

import {
  CreateClientActivityInput,
  UpdateClientActivityInput,
  createClientActivity,
  listClientActivities,
  updateClientActivity,
} from '@/server/services/client-activities';

const baseActivitySchema = z.object({
  clientId: z.string().min(1),
  clientName: z.string().min(1),
  opportunityId: z.string().optional().nullable(),
  opportunityTitle: z.string().optional().nullable(),
  userId: z.string().min(1),
  userName: z.string().min(1),
  type: z.string().min(1),
  observation: z.string().min(1),
  isTask: z.boolean(),
  dueDate: z.string().optional().nullable(),
  completed: z.boolean().optional(),
  completedByUserId: z.string().optional(),
  completedByUserName: z.string().optional(),
  googleCalendarEventId: z.string().optional().nullable(),
});

const createSchema = z.object({
  activity: baseActivitySchema.transform((value) => ({
    ...value,
    opportunityId: value.opportunityId ?? undefined,
    opportunityTitle: value.opportunityTitle ?? undefined,
    dueDate: value.dueDate ?? undefined,
    googleCalendarEventId: value.googleCalendarEventId ?? undefined,
  })),
});

const updateSchema = z.object({
  id: z.string().min(1),
  data: baseActivitySchema.partial().transform((value) => ({
    ...value,
    opportunityId: value.opportunityId ?? undefined,
    opportunityTitle: value.opportunityTitle ?? undefined,
    dueDate: value.dueDate ?? undefined,
    googleCalendarEventId: value.googleCalendarEventId ?? undefined,
  })),
});

export async function GET(request: NextRequest) {
  try {
    const clientId = request.nextUrl.searchParams.get('clientId') ?? undefined;
    const activities = await listClientActivities(clientId ?? undefined);
    return NextResponse.json(activities);
  } catch (error) {
    console.error('Failed to fetch client activities:', error);
    return NextResponse.json({ error: 'Failed to fetch client activities' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const parsed = createSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
    }

    const id = await createClientActivity(parsed.data.activity as CreateClientActivityInput);
    return NextResponse.json({ id }, { status: 201 });
  } catch (error) {
    console.error('Failed to create activity:', error);
    return NextResponse.json({ error: 'Failed to create activity' }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const body = await request.json();
    const parsed = updateSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
    }

    await updateClientActivity(
      parsed.data.id,
      parsed.data.data as UpdateClientActivityInput,
    );
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Failed to update activity:', error);
    return NextResponse.json({ error: 'Failed to update activity' }, { status: 500 });
  }
}

export async function DELETE() {
  return NextResponse.json({ error: 'Method not implemented' }, { status: 405 });
}
