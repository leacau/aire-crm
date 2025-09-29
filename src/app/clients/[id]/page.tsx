
'use client';

import React, { useEffect, useState, useMemo } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { useAuth } from '@/hooks/use-auth';
import { ClientDetails } from '@/components/clients/client-details';
import { Spinner } from '@/components/ui/spinner';
import { Header } from '@/components/layout/header';
import { Button } from '@/components/ui/button';
import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import type { Client } from '@/lib/types';
import { getClient, updateClient } from '@/lib/firebase-service';
import { useToast } from '@/hooks/use-toast';

export default function ClientPage() {
  const { userInfo, loading: authLoading } = useAuth();
  const router = useRouter();
  const { toast } = useToast();
  const params = useParams();
  
  const id = params.id as string;
  
  const [client, setClient] = useState<Client | null>(null);
  const [loadingClient, setLoadingClient] = useState(true);

  useEffect(() => {
    const fetchClient = async () => {
      if (!id) return;
      setLoadingClient(true);
      try {
        const fetchedClient = await getClient(id);
        if (fetchedClient) {
          setClient(fetchedClient);
        } else {
          toast({ title: "Cliente no encontrado", variant: "destructive" });
          router.push('/clients');
        }
      } catch (error) {
        console.error("Error fetching client:", error);
        toast({ title: "Error al cargar el cliente", variant: "destructive" });
        router.push('/clients');
      } finally {
        setLoadingClient(false);
      }
    };

    fetchClient();
  }, [id, router, toast]);

  const userHasAccess = useMemo(() => {
    if (!client || !userInfo) return false;
    return (
      userInfo.role === 'Jefe' ||
      userInfo.role === 'Administracion' ||
      (userInfo.role === 'Asesor' && client.ownerId === userInfo.id)
    );
  }, [client, userInfo]);

  useEffect(() => {
    if (!authLoading && !loadingClient && !userHasAccess) {
      toast({ title: "Acceso denegado", description: "No tienes permiso para ver este cliente.", variant: "destructive" });
      router.push('/clients');
    }
  }, [authLoading, loadingClient, userHasAccess, router, toast, client]);


  const handleUpdateClient = async (updatedData: Partial<Omit<Client, 'id'>>) => {
    if (!client || !userInfo) return;
    try {
        await updateClient(client.id, updatedData, userInfo.id, userInfo.name);
        setClient(prev => prev ? { ...prev, ...updatedData } : null);
        toast({ title: "Cliente Actualizado", description: "Los datos del cliente se han guardado." });
    } catch (error) {
        console.error("Error updating client:", error);
        toast({ title: "Error al actualizar", variant: "destructive" });
    }
  };

  if (authLoading || loadingClient || !client || !userHasAccess) {
    return (
      <div className="flex h-full w-full items-center justify-center">
        <Spinner size="large" />
      </div>
    );
  }
  
  return (
    <div className="flex flex-col h-full">
      <Header title={client.denominacion}>
        <Button asChild variant="outline">
          <Link href="/clients">
            <ArrowLeft className="mr-2 h-4 w-4" />
            Volver a Clientes
          </Link>
        </Button>
      </Header>
      <main className="flex-1 overflow-auto p-4 md:p-6 lg:p-8">
        <ClientDetails
          client={client}
          onUpdate={handleUpdateClient}
        />
      </main>
    </div>
  );
}
