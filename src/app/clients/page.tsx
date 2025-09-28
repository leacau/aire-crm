
'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { Header } from '@/components/layout/header';
import { Button } from '@/components/ui/button';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { opportunities } from '@/lib/data';
import { FileDown, MoreHorizontal, PlusCircle } from 'lucide-react';
import Link from 'next/link';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { useAuth } from '@/hooks/use-auth';
import { Spinner } from '@/components/ui/spinner';
import { ClientFormDialog } from '@/components/clients/client-form-dialog';
import type { Client } from '@/lib/types';
import { createClient, getClients } from '@/lib/firebase-service';
import { useToast } from '@/hooks/use-toast';

export default function ClientsPage() {
  const { userInfo, loading: authLoading } = useAuth();
  const { toast } = useToast();
  const [clients, setClients] = useState<Client[]>([]);
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [clientsLoading, setClientsLoading] = useState(true);

  const fetchClients = useCallback(async () => {
    setClientsLoading(true);
    try {
      const fetchedClients = await getClients();
      setClients(fetchedClients);
    } catch (error) {
      console.error("Error fetching clients:", error);
      toast({
        title: "Error al cargar clientes",
        description: "No se pudieron cargar los datos de los clientes.",
        variant: "destructive",
      });
    } finally {
      setClientsLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    if (!authLoading) {
      fetchClients();
    }
  }, [authLoading, fetchClients]);

  const handleSaveClient = async (clientData: Omit<Client, 'id' | 'avatarUrl' | 'avatarFallback' | 'personIds' | 'ownerId'>) => {
    if (!userInfo) {
        toast({
            title: "Error",
            description: "Debes iniciar sesión para crear un cliente.",
            variant: "destructive",
        });
        return;
    }

    try {
      await createClient(clientData, userInfo.id);
      toast({
        title: "Cliente Creado",
        description: `${clientData.denominacion} ha sido añadido a la lista.`,
      });
      fetchClients(); // Refresh the list
    } catch (error) {
        console.error("Error creating client:", error);
        toast({
            title: "Error al crear cliente",
            description: "No se pudo guardar el cliente.",
            variant: "destructive",
        });
    }
  };

  if (authLoading || clientsLoading) {
    return (
      <div className="flex h-full w-full items-center justify-center">
        <Spinner size="large" />
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      <Header title="Clientes">
        <Button variant="outline" className="hidden sm:flex">
          <FileDown className="mr-2" />
          Exportar CSV
        </Button>
        <Button onClick={() => setIsFormOpen(true)}>
          <PlusCircle className="mr-2" />
          Nuevo Cliente
        </Button>
      </Header>
      <main className="flex-1 overflow-auto p-4 md:p-6 lg:p-8">
        <div className="border rounded-lg">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-[80px]">Avatar</TableHead>
                <TableHead>Denominación</TableHead>
                <TableHead>Razón Social</TableHead>
                <TableHead>Negocios Abiertos</TableHead>
                <TableHead>Valor Total</TableHead>
                <TableHead className="w-[50px]"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {clients.map((client) => {
                const clientOpps = opportunities.filter(
                  (opp) => opp.clientId === client.id && opp.stage !== 'Cerrado - Ganado' && opp.stage !== 'Cerrado - Perdido'
                );
                const totalValue = clientOpps.reduce(
                  (acc, opp) => acc + opp.value,
                  0
                );
                return (
                  <TableRow key={client.id}>
                    <TableCell>
                      <Avatar>
                        <AvatarImage src={client.avatarUrl} alt={client.denominacion} data-ai-hint="logo building" />
                        <AvatarFallback>{client.avatarFallback}</AvatarFallback>
                      </Avatar>
                    </TableCell>
                    <TableCell>
                      <Link
                        href={`/clients/${client.id}`}
                        className="font-medium text-primary hover:underline"
                      >
                        {client.denominacion}
                      </Link>
                    </TableCell>
                    <TableCell>
                      <div>
                        <div className="font-medium">{client.razonSocial}</div>
                        <div className="text-sm text-muted-foreground">
                          {client.email}
                        </div>
                      </div>
                    </TableCell>
                    <TableCell>{clientOpps.length}</TableCell>
                    <TableCell>${totalValue.toLocaleString()}</TableCell>
                    <TableCell>
                      <Button variant="ghost" size="icon">
                        <MoreHorizontal className="h-4 w-4" />
                      </Button>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      </main>
      <ClientFormDialog
        isOpen={isFormOpen}
        onOpenChange={setIsFormOpen}
        onSave={handleSaveClient}
      />
    </div>
  );
}
