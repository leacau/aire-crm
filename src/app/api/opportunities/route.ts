import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';

import {
  CreateOpportunityInput,
  OpportunityMutationContext,
  UpdateOpportunityInput,
  createOpportunity,
  deleteOpportunity,
  listOpportunities,
  updateOpportunity,
} from '@/server/services/opportunities';

const contextSchema = z.object({
  userId: z.string().min(1),
  userName: z.string().min(1),
  ownerName: z.string().min(1),
  accessToken: z.string().optional().nullable(),
});

const baseOpportunitySchema = z.object({
  title: z.string().min(1),
  clientName: z.string().min(1),
  clientId: z.string().min(1),
  value: z.number().nonnegative(),
  stage: z.string().min(1),
  closeDate: z.string().min(1),
  details: z.string().optional(),
  observaciones: z.string().optional(),
  bonificacionDetalle: z.string().optional(),
  bonificacionEstado: z.string().optional(),
  bonificacionAutorizadoPorId: z.string().optional(),
  bonificacionAutorizadoPorNombre: z.string().optional(),
  bonificacionFechaAutorizacion: z.string().optional(),
  periodicidad: z.array(z.string()).optional(),
  facturaPorAgencia: z.boolean().optional(),
  agencyId: z.string().optional().nullable(),
  formaDePago: z.array(z.string()).optional(),
  fechaFacturacion: z.string().optional(),
  pautados: z
    .array(
      z.object({
        id: z.string(),
        fechaInicio: z.string().optional(),
        fechaFin: z.string().optional(),
      }),
    )
    .optional(),
  proposalFiles: z
    .array(
      z.object({
        name: z.string(),
        url: z.string(),
      }),
    )
    .optional(),
  ordenesPautado: z
    .array(
      z.object({
        id: z.string(),
        fecha: z.string(),
        numeroOM: z.string().optional(),
        ajustaPorInflacion: z.boolean().optional(),
        tipoAjuste: z.string().optional(),
      }),
    )
    .optional(),
});

const createSchema = z.object({
  opportunity: baseOpportunitySchema.transform((value) => ({
    ...value,
    agencyId: value.agencyId ?? undefined,
  })),
  context: contextSchema,
});

const updateSchema = z.object({
  id: z.string().min(1),
  data: baseOpportunitySchema.partial().transform((value) => ({
    ...value,
    agencyId: value.agencyId ?? undefined,
  })),
  context: contextSchema,
});

const deleteSchema = z.object({
  id: z.string().min(1),
  context: contextSchema,
});

export async function GET(request: NextRequest) {
  try {
    const clientId = request.nextUrl.searchParams.get('clientId') ?? undefined;
    const opportunities = await listOpportunities(clientId ?? undefined);
    return NextResponse.json(opportunities);
  } catch (error) {
    console.error('Failed to fetch opportunities:', error);
    return NextResponse.json({ error: 'Failed to fetch opportunities' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const parsed = createSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
    }

    const id = await createOpportunity(
      parsed.data.opportunity as CreateOpportunityInput,
      parsed.data.context as OpportunityMutationContext,
    );

    return NextResponse.json({ id }, { status: 201 });
  } catch (error) {
    console.error('Failed to create opportunity:', error);
    return NextResponse.json({ error: 'Failed to create opportunity' }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const body = await request.json();
    const parsed = updateSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
    }

    await updateOpportunity(
      parsed.data.id,
      parsed.data.data as UpdateOpportunityInput,
      parsed.data.context as OpportunityMutationContext,
    );

    return NextResponse.json({ success: true });
  } catch (error) {
    if (error instanceof Error && error.message === 'Opportunity not found') {
      return NextResponse.json({ error: error.message }, { status: 404 });
    }
    console.error('Failed to update opportunity:', error);
    return NextResponse.json({ error: 'Failed to update opportunity' }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const body = await request.json();
    const parsed = deleteSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
    }

    await deleteOpportunity(
      parsed.data.id,
      parsed.data.context as OpportunityMutationContext,
    );

    return NextResponse.json({ success: true });
  } catch (error) {
    if (error instanceof Error && error.message === 'Opportunity not found') {
      return NextResponse.json({ error: error.message }, { status: 404 });
    }
    console.error('Failed to delete opportunity:', error);
    return NextResponse.json({ error: 'Failed to delete opportunity' }, { status: 500 });
  }
}
