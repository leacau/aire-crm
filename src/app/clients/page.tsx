

'use client';

import React, { useState, useEffect, useCallback, useMemo } from 'react';
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
import { FileDown, MoreHorizontal, PlusCircle, Search, Trash2 } from 'lucide-react';
import Link from 'next/link';
import { useAuth } from '@/hooks/use-auth';
import { Spinner } from '@/components/ui/spinner';
import { ClientFormDialog } from '@/components/clients/client-form-dialog';
import type { Client, Opportunity, User } from '@/lib/types';
import { createClient, getClients, getAllOpportunities, deleteClient, getAllUsers } from '@/lib/firebase-service';
import { useToast } from '@/hooks/use-toast';
import { Input } from '@/components/ui/input';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Badge } from '@/components/ui/badge';

export default function ClientsPage() {
  const { userInfo, loading: authLoading, isBoss } = useAuth();
  const { toast } = useToast();
  const [clients, setClients] = useState<Client[]>([]);
  const [opportunities, setOpportunities] = useState<Opportunity[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [clientToDelete, setClientToDelete] = useState<Client | null>(null);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const [fetchedClients, fetchedOpps, fetchedUsers] = await Promise.all([
          getClients(),
          getAllOpportunities(),
          getAllUsers(),
      ]);
      setClients(fetchedClients);
      setOpportunities(fetchedOpps);
      setUsers(fetchedUsers);
    } catch (error) {
      console.error("Error fetching data:", error);
      toast({
        title: "Error al cargar datos",
        description: "No se pudieron cargar los datos.",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    if (!authLoading) {
      fetchData();
    }
  }, [authLoading, fetchData]);

  const filteredClients = useMemo(() => {
    if (searchTerm.length < 3) {
      return clients;
    }
    const lowercasedFilter = searchTerm.toLowerCase();
    return clients.filter(client =>
      client.denominacion.toLowerCase().includes(lowercasedFilter) ||
      client.razonSocial.toLowerCase().includes(lowercasedFilter)
    );
  }, [clients, searchTerm]);

  const usersMap = useMemo(() => {
    return users.reduce((acc, user) => {
        acc[user.id] = user;
        return acc;
    }, {} as Record<string, User>);
  }, [users]);


  const handleSaveClient = async (clientData: Omit<Client, 'id' | 'personIds' | 'ownerId' | 'ownerName'>) => {
    if (!userInfo) {
        toast({
            title: "Error",
            description: "Debes iniciar sesión para crear un cliente.",
            variant: "destructive",
        });
        return;
    }

    try {
      await createClient(clientData, userInfo.id, userInfo.name);
      toast({
        title: "Cliente Creado",
        description: `${clientData.denominacion} ha sido añadido a la lista.`,
      });
      fetchData(); // Refresh the list
    } catch (error) {
        console.error("Error creating client:", error);
        toast({
            title: "Error al crear cliente",
            description: "No se pudo guardar el cliente.",
            variant: "destructive",
        });
    }
  };
  
  const handleDeleteClient = async () => {
    if (!clientToDelete || !userInfo) return;
    try {
      await deleteClient(clientToDelete.id, userInfo.id, userInfo.name);
      toast({
        title: "Cliente Eliminado",
        description: `${clientToDelete.denominacion} ha sido eliminado.`,
      });
      fetchData(); // Refresh the list
    } catch (error) {
      console.error("Error deleting client:", error);
      toast({ title: "Error al eliminar el cliente", variant: "destructive" });
    } finally {
      setClientToDelete(null);
    }
  }

  const validateCuit = async (cuit: string, clientId?: string): Promise<string | false> => {
    const existingClient = clients.find(c => c.cuit === cuit && c.id !== clientId);
    if (existingClient) {
      const ownerName = usersMap[existingClient.ownerId]?.name || 'un asesor desconocido';
      return `El CUIT ya pertenece al cliente "${existingClient.denominacion}", asignado a ${ownerName}.`;
    }
    return false;
  };

  if (authLoading || loading) {
    return (
      <div className="flex h-full w-full items-center justify-center">
        <Spinner size="large" />
      </div>
    );
  }

  return (
    <>
    <div className="flex flex-col h-full">
      <Header title="Clientes">
         <div className="relative ml-auto flex-1 md:grow-0">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
                type="search"
                placeholder="Buscar..."
                className="w-full rounded-lg bg-background pl-8 md:w-[200px] lg:w-[330px]"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
            />
        </div>
        <Button variant="outline" className="hidden sm:flex">
          <FileDown className="mr-2" />
          Exportar
        </Button>
        <Button onClick={() => setIsFormOpen(true)}>
          <PlusCircle className="mr-2" />
          Nuevo
        </Button>
      </Header>
      <main className="flex-1 overflow-auto p-4 md:p-6 lg:p-8">
        <div className="border rounded-lg">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Denominación</TableHead>
                <TableHead className="hidden sm:table-cell">Razón Social</TableHead>
                <TableHead className="hidden lg:table-cell">Negocios Abiertos</TableHead>
                <TableHead className="hidden lg:table-cell">Valor Total</TableHead>
                <TableHead className="w-[100px]">Acciones</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredClients.map((client) => {
                const clientOpps = opportunities.filter(
                  (opp) => opp.clientId === client.id && opp.stage !== 'Cerrado - Ganado' && opp.stage !== 'Cerrado - Perdido'
                );
                const totalValue = clientOpps.reduce(
                  (acc, opp) => acc + opp.value,
                  0
                );

                const isOwner = userInfo?.id === client.ownerId;
                const canViewDetails = userInfo && (isBoss || isOwner);
                const shouldShowOwner = isBoss || !isOwner;
                const ownerName = usersMap[client.ownerId]?.name;


                return (
                  <TableRow key={client.id}>
                    <TableCell>
                      <div className="flex flex-col gap-1">
                        {canViewDetails ? (
                          <Link
                            href={`/clients/${client.id}`}
                            className="font-medium text-primary hover:underline"
                          >
                            {client.denominacion}
                          </Link>
                        ) : (
                          <span className="font-medium">{client.denominacion}</span>
                        )}
                         <div className="text-sm text-muted-foreground flex items-center gap-2">
                           <span>{client.email}</span>
                           {shouldShowOwner && ownerName && <Badge variant="secondary" className="font-normal">{ownerName}</Badge>}
                        </div>
                      </div>
                    </TableCell>
                    <TableCell className="hidden sm:table-cell">
                      {client.razonSocial}
                    </TableCell>
                    <TableCell className="hidden lg:table-cell">{canViewDetails ? clientOpps.length : '-'}</TableCell>
                    <TableCell className="hidden lg:table-cell">{canViewDetails ? `$${totalValue.toLocaleString('es-AR')}` : '-'}</TableCell>
                    <TableCell>
                      <div className='flex items-center gap-2'>
                          <Button variant="ghost" size="icon" disabled>
                            <MoreHorizontal className="h-4 w-4" />
                          </Button>
                          {isBoss && (
                            <Button variant="ghost" size="icon" onClick={() => setClientToDelete(client)}>
                                <Trash2 className="h-4 w-4 text-destructive" />
                            </Button>
                          )}
                      </div>
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
        onValidateCuit={validateCuit}
      />
    </div>
     <AlertDialog open={!!clientToDelete} onOpenChange={(open) => !open && setClientToDelete(null)}>
        <AlertDialogContent>
            <AlertDialogHeader>
            <AlertDialogTitle>¿Estás realmente seguro?</AlertDialogTitle>
            <AlertDialogDescription>
                Esta acción es irreversible. Se eliminará permanentemente el cliente <strong>{clientToDelete?.denominacion}</strong> y todas sus oportunidades y contactos asociados.
            </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={handleDeleteClient} variant="destructive">Eliminar</AlertDialogAction>
            </AlertDialogFooter>
        </AlertDialogContent>
    </AlertDialog>
    </>
  );
}
