

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
import { FileDown, MoreHorizontal, PlusCircle, Search, Trash2, UserCog } from 'lucide-react';
import Link from 'next/link';
import { useAuth } from '@/hooks/use-auth';
import { Spinner } from '@/components/ui/spinner';
import { ClientFormDialog } from '@/components/clients/client-form-dialog';
import type { Client, Opportunity, User } from '@/lib/types';
import { createClient, getClients, getAllOpportunities, deleteClient, getAllUsers, updateClient } from '@/lib/firebase-service';
import { useToast } from '@/hooks/use-toast';
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
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
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

function ReassignClientDialog({ 
  client, 
  advisors, 
  isOpen, 
  onOpenChange, 
  onReassign 
}: { 
  client: Client | null, 
  advisors: User[], 
  isOpen: boolean, 
  onOpenChange: (open: boolean) => void,
  onReassign: (newOwnerId: string) => Promise<void>
}) {
  const [selectedAdvisorId, setSelectedAdvisorId] = useState('');
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    if (client) {
      setSelectedAdvisorId(client.ownerId);
    }
  }, [client]);

  const handleSave = async () => {
    if (!client || !selectedAdvisorId || selectedAdvisorId === client.ownerId) {
      onOpenChange(false);
      return;
    }
    setIsSaving(true);
    await onReassign(selectedAdvisorId);
    setIsSaving(false);
    onOpenChange(false);
  };

  return (
    <AlertDialog open={isOpen} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Reasignar Cliente</AlertDialogTitle>
          <AlertDialogDescription>
            Selecciona un nuevo asesor para el cliente <strong>{client?.denominacion}</strong>.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <div className="py-4">
          <Select value={selectedAdvisorId} onValueChange={setSelectedAdvisorId}>
            <SelectTrigger>
              <SelectValue placeholder="Seleccionar asesor..." />
            </SelectTrigger>
            <SelectContent>
              {advisors.map(advisor => (
                <SelectItem key={advisor.id} value={advisor.id}>
                  {advisor.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancelar</AlertDialogCancel>
          <AlertDialogAction onClick={handleSave} disabled={isSaving}>
            {isSaving ? <Spinner size="small" /> : "Reasignar"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}


export default function ClientsPage() {
  const { userInfo, loading: authLoading, isBoss } = useAuth();
  const { toast } = useToast();
  const [clients, setClients] = useState<Client[]>([]);
  const [opportunities, setOpportunities] = useState<Opportunity[]>([]);
  const [advisors, setAdvisors] = useState<User[]>([]);
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [clientToDelete, setClientToDelete] = useState<Client | null>(null);
  const [clientToReassign, setClientToReassign] = useState<Client | null>(null);
  const [showOnlyMyClients, setShowOnlyMyClients] = useState(!isBoss);
  const canManage = isBoss || userInfo?.role === 'Administracion';


  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const promises = [
          getClients(),
          getAllOpportunities()
      ];
      if (canManage) {
        promises.push(getAllUsers('Asesor'));
      }
      const [fetchedClients, fetchedOpps, fetchedAdvisors] = await Promise.all(promises);

      setClients(fetchedClients);
      setOpportunities(fetchedOpps);
      if(fetchedAdvisors) {
        setAdvisors(fetchedAdvisors);
      }
    } catch (error) {
      console.error("Error fetching data:", error);
      toast({
        title: "Error al cargar datos",
        description: "No se pudieron cargar los datos de clientes y oportunidades.",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  }, [toast, canManage]);

  useEffect(() => {
    if (!authLoading) {
      fetchData();
    }
  }, [authLoading, fetchData]);
  
  useEffect(() => {
    if (userInfo) {
      setShowOnlyMyClients(!isBoss);
    }
  }, [isBoss, userInfo]);

  const filteredClients = useMemo(() => {
    let clientsToShow = clients;

    if (showOnlyMyClients && userInfo) {
        clientsToShow = clients.filter(client => client.ownerId === userInfo.id);
    }

    if (searchTerm.length < 3) {
      return clientsToShow;
    }
    const lowercasedFilter = searchTerm.toLowerCase();
    return clientsToShow.filter(client =>
      client.denominacion.toLowerCase().includes(lowercasedFilter) ||
      client.razonSocial.toLowerCase().includes(lowercasedFilter)
    );
  }, [clients, searchTerm, showOnlyMyClients, userInfo]);


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

  const handleReassignClient = async (newOwnerId: string) => {
    if (!clientToReassign || !userInfo || !canManage) return;
    
    const newOwner = advisors.find(a => a.id === newOwnerId);
    if (!newOwner) {
      toast({ title: 'Asesor no encontrado', variant: 'destructive' });
      return;
    }

    try {
      await updateClient(
        clientToReassign.id,
        { ownerId: newOwner.id, ownerName: newOwner.name },
        userInfo.id,
        userInfo.name
      );
      toast({ title: "Cliente Reasignado", description: `${clientToReassign.denominacion} ha sido asignado a ${newOwner.name}.`});
      fetchData();
    } catch (error) {
      console.error("Error reassigning client:", error);
      toast({ title: "Error al reasignar el cliente", variant: "destructive" });
    }
  };

  const validateCuit = async (cuit: string, clientId?: string): Promise<string | false> => {
    if (!cuit) return false;
    const existingClient = clients.find(c => c.cuit === cuit && c.id !== clientId);
    if (existingClient) {
      return `El CUIT ya pertenece al cliente "${existingClient.denominacion}", asignado a ${existingClient.ownerName}.`;
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
         <div className="flex items-center space-x-2">
            <Checkbox id="my-clients" checked={showOnlyMyClients} onCheckedChange={(checked) => setShowOnlyMyClients(!!checked)} />
            <Label htmlFor="my-clients" className="whitespace-nowrap text-sm font-medium">Mostrar solo mis clientes</Label>
        </div>
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

                const canViewDetails = userInfo && (
                    isBoss || 
                    (userInfo.role === 'Asesor' && client.ownerId === userInfo.id)
                );

                return (
                  <TableRow key={client.id}>
                    <TableCell>
                      <div>
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
                        {isBoss && userInfo && client.ownerId !== userInfo.id && (
                           <p className="text-xs text-muted-foreground">{client.ownerName}</p>
                        )}
                      </div>
                    </TableCell>
                    <TableCell className="hidden sm:table-cell">
                      <div>
                        <div className="font-medium">{client.razonSocial}</div>
                        <div className="text-sm text-muted-foreground">
                          {client.email}
                        </div>
                      </div>
                    </TableCell>
                    <TableCell className="hidden lg:table-cell">{canViewDetails ? clientOpps.length : '-'}</TableCell>
                    <TableCell className="hidden lg:table-cell">{canViewDetails ? `$${totalValue.toLocaleString('es-AR')}` : '-'}</TableCell>
                    <TableCell>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon">
                            <MoreHorizontal className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent>
                          <DropdownMenuItem asChild disabled={!canViewDetails}>
                            <Link href={`/clients/${client.id}`}>Ver detalles</Link>
                          </DropdownMenuItem>
                          {canManage && (
                            <DropdownMenuItem onClick={() => setClientToReassign(client)}>
                              <UserCog className="mr-2 h-4 w-4" />
                              Reasignar
                            </DropdownMenuItem>
                          )}
                          {isBoss && (
                            <DropdownMenuItem className="text-destructive" onClick={() => setClientToDelete(client)}>
                              <Trash2 className="mr-2 h-4 w-4" />
                              Eliminar
                            </DropdownMenuItem>
                          )}
                        </DropdownMenuContent>
                      </DropdownMenu>
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
    <ReassignClientDialog 
      client={clientToReassign}
      advisors={advisors}
      isOpen={!!clientToReassign}
      onOpenChange={(open) => !open && setClientToReassign(null)}
      onReassign={handleReassignClient}
    />
    </>
  );
}
