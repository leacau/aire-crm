import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';

import {
  ClientMutationContext,
  CreateClientInput,
  UpdateClientInput,
  createClient,
  deleteClient,
  getClientById,
  listClients,
  updateClient,
} from '@/server/services/clients';

const contextSchema = z.object({
  userId: z.string().min(1),
  userName: z.string().min(1),
});

const baseClientSchema = z.object({
  denominacion: z.string().min(1),
  razonSocial: z.string().min(1),
  cuit: z.string().trim().optional(),
  condicionIVA: z.string().min(1),
  provincia: z.string().min(1),
  localidad: z.string().min(1),
  tipoEntidad: z.string().min(1),
  rubro: z.string().min(1),
  email: z.string().email(),
  phone: z.string().min(1),
  observaciones: z.string().optional(),
  agencyId: z.string().optional().nullable(),
  ownerId: z.string().optional(),
  ownerName: z.string().optional(),
  isNewClient: z.boolean().optional(),
  isDeactivated: z.boolean().optional(),
});

const createSchema = z.object({
  client: baseClientSchema.transform((value) => ({
    ...value,
    agencyId: value.agencyId ?? undefined,
  })),
  context: contextSchema.optional(),
});

const updateSchema = z.object({
  id: z.string().min(1),
  data: baseClientSchema.partial().transform((value) => ({
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
    const id = request.nextUrl.searchParams.get('id');
    if (id) {
      const client = await getClientById(id);
      if (!client) {
        return NextResponse.json({ error: 'Client not found' }, { status: 404 });
      }
      return NextResponse.json(client);
    }

    const clients = await listClients();
    return NextResponse.json(clients);
  } catch (error) {
    console.error('Failed to fetch clients:', error);
    return NextResponse.json({ error: 'Failed to fetch clients' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const parsed = createSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
    }

    const clientId = await createClient(
      parsed.data.client as CreateClientInput,
      parsed.data.context as ClientMutationContext | undefined,
    );

    return NextResponse.json({ id: clientId }, { status: 201 });
  } catch (error) {
    console.error('Failed to create client:', error);
    return NextResponse.json({ error: 'Failed to create client' }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const body = await request.json();
    const parsed = updateSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
    }

    await updateClient(
      parsed.data.id,
      parsed.data.data as UpdateClientInput,
      parsed.data.context as ClientMutationContext,
    );

    return NextResponse.json({ success: true });
  } catch (error) {
    if (error instanceof Error && error.message === 'Client not found') {
      return NextResponse.json({ error: error.message }, { status: 404 });
    }
    console.error('Failed to update client:', error);
    return NextResponse.json({ error: 'Failed to update client' }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const body = await request.json();
    const parsed = deleteSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
    }

    await deleteClient(parsed.data.id, parsed.data.context as ClientMutationContext);
    return NextResponse.json({ success: true });
  } catch (error) {
    if (error instanceof Error && error.message === 'Client not found') {
      return NextResponse.json({ error: error.message }, { status: 404 });
    }
    console.error('Failed to delete client:', error);
    return NextResponse.json({ error: 'Failed to delete client' }, { status: 500 });
  }
}
