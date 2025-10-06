

'use client';

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { Header } from '@/components/layout/header';
import { Button } from '@/components/ui/button';
import { FileDown, MoreHorizontal, PlusCircle, Search, Trash2, UserCog, CopyCheck } from 'lucide-react';
import Link from 'next/link';
import { useAuth } from '@/hooks/use-auth';
import { Spinner } from '@/components/ui/spinner';
import { ClientFormDialog } from '@/components/clients/client-form-dialog';
import type { Client, Opportunity, User } from '@/lib/types';
import { createClient, getClients, getAllOpportunities, deleteClient, getAllUsers, updateClient, bulkDeleteClients, bulkUpdateClients } from '@/lib/firebase-service';
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
import { ResizableDataTable } from '@/components/ui/resizable-data-table';
import type { ColumnDef, SortingState, RowSelectionState } from '@tanstack/react-table';
import { useRouter } from 'next/navigation';
import { findBestMatch } from 'string-similarity';

function ReassignClientDialog({ 
  clients, 
  advisors, 
  isOpen, 
  onOpenChange, 
  onReassign 
}: { 
  clients: Client[], 
  advisors: User[], 
  isOpen: boolean, 
  onOpenChange: (open: boolean) => void,
  onReassign: (newOwnerId: string) => Promise<void>
}) {
  const [selectedAdvisorId, setSelectedAdvisorId] = useState('');
  const [isSaving, setIsSaving] = useState(false);

  const clientNames = clients.map(c => c.denominacion).join(', ');

  useEffect(() => {
    if (clients.length === 1) {
      setSelectedAdvisorId(clients[0].ownerId);
    } else {
        setSelectedAdvisorId('');
    }
  }, [clients]);

  const handleSave = async () => {
    if (clients.length === 0 || !selectedAdvisorId) {
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
          <AlertDialogTitle>Reasignar Cliente(s)</AlertDialogTitle>
          <AlertDialogDescription>
            Selecciona un nuevo asesor para {clients.length > 1 ? `${clients.length} clientes` : `el cliente`}: <strong>{clientNames}</strong>.
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

function BulkDeleteDialog({
    clients,
    isOpen,
    onOpenChange,
    onConfirm,
    isDeleting
}: {
    clients: Client[],
    isOpen: boolean,
    onOpenChange: (open: boolean) => void,
    onConfirm: () => void,
    isDeleting: boolean
}) {
    return (
        <AlertDialog open={isOpen} onOpenChange={onOpenChange}>
            <AlertDialogContent>
                <AlertDialogHeader>
                    <AlertDialogTitle>¿Estás realmente seguro?</AlertDialogTitle>
                    <AlertDialogDescription>
                        Esta acción es irreversible. Se eliminarán permanentemente <strong>{clients.length} cliente(s)</strong> y todas sus oportunidades y contactos asociados.
                    </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                    <AlertDialogCancel>Cancelar</AlertDialogCancel>
                    <Button onClick={onConfirm} variant="destructive" disabled={isDeleting}>
                        {isDeleting ? <Spinner size="small"/> : 'Eliminar'}
                    </Button>
                </AlertDialogFooter>
            </AlertDialogContent>
        </AlertDialog>
    );
}


export default function ClientsPage() {
  const { userInfo, loading: authLoading, isBoss } = useAuth();
  const { toast } = useToast();
  const router = useRouter();
  const [clients, setClients] = useState<Client[]>([]);
  const [opportunities, setOpportunities] = useState<Opportunity[]>([]);
  const [advisors, setAdvisors] = useState<User[]>([]);
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [clientToDelete, setClientToDelete] = useState<Client | null>(null);
  const [clientsToReassign, setClientsToReassign] = useState<Client[]>([]);
  const [clientsToDelete, setClientsToDelete] = useState<Client[]>([]);
  const [showOnlyMyClients, setShowOnlyMyClients] = useState(!isBoss);
  const canManage = isBoss || userInfo?.role === 'Administracion';
  const [sorting, setSorting] = useState<SortingState>([]);
  const [rowSelection, setRowSelection] = React.useState<RowSelectionState>({});
  const [showDuplicates, setShowDuplicates] = useState(false);
  const [isBulkDeleting, setIsBulkDeleting] = useState(false);


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

  useEffect(() => {
    setRowSelection({});
  }, [searchTerm, showOnlyMyClients, showDuplicates]);


  const displayedClients = useMemo(() => {
    let clientsToShow = clients;

    if (showOnlyMyClients && userInfo) {
        clientsToShow = clients.filter(client => client.ownerId === userInfo.id);
    }

    if (showDuplicates) {
        const potentialDuplicates = new Set<string>();
        const allClientNames = clients.map(c => ({ id: c.id, name: c.denominacion, rz: c.razonSocial }));

        clients.forEach(client => {
            const others = allClientNames.filter(c => c.id !== client.id);
            const nameTargets = others.map(o => o.name).filter(Boolean);
            const rzTargets = others.map(o => o.rz).filter(Boolean);

            if (client.denominacion && nameTargets.length > 0) {
                const { bestMatch: bestNameMatch } = findBestMatch(client.denominacion, nameTargets);
                if (bestNameMatch.rating > 0.7) {
                    const match = others.find(o => o.name === bestNameMatch.target);
                    if(match) {
                        potentialDuplicates.add(client.id);
                        potentialDuplicates.add(match.id);
                    }
                }
            }
            if (client.razonSocial && rzTargets.length > 0) {
                 const { bestMatch: bestRzMatch } = findBestMatch(client.razonSocial, rzTargets);
                 if (bestRzMatch.rating > 0.7) {
                    const match = others.find(o => o.rz === bestRzMatch.target);
                    if (match) {
                        potentialDuplicates.add(client.id);
                        potentialDuplicates.add(match.id);
                    }
                }
            }
        });
        
        clientsToShow = clients.filter(c => potentialDuplicates.has(c.id));
    }


    if (searchTerm.length < 3) {
      return clientsToShow;
    }
    const lowercasedFilter = searchTerm.toLowerCase();
    return clientsToShow.filter(client => {
      const denominacion = client.denominacion || '';
      const razonSocial = client.razonSocial || '';
      return (
        denominacion.toLowerCase().includes(lowercasedFilter) ||
        razonSocial.toLowerCase().includes(lowercasedFilter)
      );
    });
  }, [clients, searchTerm, showOnlyMyClients, userInfo, showDuplicates]);


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

  const handleBulkDelete = async () => {
    if (clientsToDelete.length === 0 || !userInfo) return;

    setIsBulkDeleting(true);
    try {
        const idsToDelete = clientsToDelete.map(c => c.id);
        await bulkDeleteClients(idsToDelete, userInfo.id, userInfo.name);
        toast({ title: `${idsToDelete.length} cliente(s) eliminado(s)` });
        fetchData();
        setRowSelection({});
    } catch (error) {
        console.error("Error bulk deleting clients:", error);
        toast({ title: "Error al eliminar clientes", variant: "destructive" });
    } finally {
        setIsBulkDeleting(false);
        setClientsToDelete([]);
    }
  }

  const handleReassignClient = async (newOwnerId: string) => {
    if (clientsToReassign.length === 0 || !userInfo || !canManage) return;
    
    const newOwner = advisors.find(a => a.id === newOwnerId);
    if (!newOwner) {
      toast({ title: 'Asesor no encontrado', variant: 'destructive' });
      return;
    }
    
    const updates = clientsToReassign.map(client => ({
        id: client.id,
        denominacion: client.denominacion,
        data: { ownerId: newOwner.id, ownerName: newOwner.name }
    }));

    try {
      await bulkUpdateClients(updates, userInfo.id, userInfo.name);
      toast({ title: "Clientes Reasignados", description: `${clientsToReassign.length} cliente(s) han sido asignado(s) a ${newOwner.name}.`});
      fetchData();
      setRowSelection({});
    } catch (error) {
      console.error("Error reassigning clients:", error);
      toast({ title: "Error al reasignar clientes", variant: "destructive" });
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

   const handleOpenReassignDialog = () => {
    const selectedClientIds = Object.keys(rowSelection).filter(id => rowSelection[id]);
    const selectedClients = clients.filter(client => selectedClientIds.includes(client.id));
    if (selectedClients.length > 0) {
      setClientsToReassign(selectedClients);
    }
  };
  
  const handleOpenDeleteDialog = () => {
    const selectedClientIds = Object.keys(rowSelection).filter(id => rowSelection[id]);
    const selectedClients = clients.filter(client => selectedClientIds.includes(client.id));
    if (selectedClients.length > 0) {
      setClientsToDelete(selectedClients);
    }
  };
  
  const columns = useMemo<ColumnDef<Client>[]>(() => {
    const canViewDetails = (client: Client) => userInfo && (isBoss || (userInfo.role === 'Asesor' && client.ownerId === userInfo.id));

    let cols: ColumnDef<Client>[] = [];

    if (canManage) {
        cols.push({
            id: 'select',
            header: ({ table }) => (
                <Checkbox
                    checked={table.getIsAllPageRowsSelected() || (table.getIsSomePageRowsSelected() && 'indeterminate')}
                    onCheckedChange={(value) => table.toggleAllPageRowsSelected(!!value)}
                    aria-label="Seleccionar todo"
                />
            ),
            cell: ({ row }) => (
                <Checkbox
                    checked={row.getIsSelected()}
                    onCheckedChange={(value) => row.toggleSelected(!!value)}
                    aria-label="Seleccionar fila"
                />
            ),
            enableSorting: false,
            enableHiding: false,
        });
    }

    cols = cols.concat([
      {
        accessorKey: 'denominacion',
        header: 'Denominación',
        enableSorting: true,
        cell: ({ row }) => {
          const client = row.original;
          return (
            <div>
              {canViewDetails(client) ? (
                <Link href={`/clients/${client.id}`} className="font-medium text-primary hover:underline">
                  {client.denominacion}
                </Link>
              ) : (
                <span className="font-medium">{client.denominacion}</span>
              )}
              {isBoss && userInfo && client.ownerId !== userInfo.id && (
                 <p className="text-xs text-muted-foreground">{client.ownerName}</p>
              )}
            </div>
          );
        }
      },
      {
        accessorKey: 'razonSocial',
        header: 'Razón Social',
        enableSorting: true,
      },
      {
        header: 'Negocios Abiertos',
        cell: ({ row }) => {
          const client = row.original;
          const clientOpps = opportunities.filter(
            (opp) => opp.clientId === client.id && opp.stage !== 'Cerrado - Ganado' && opp.stage !== 'Cerrado - Perdido'
          );
          return canViewDetails(client) ? clientOpps.length : '-';
        },
      },
      {
        header: 'Valor Total',
        cell: ({ row }) => {
          const client = row.original;
          const clientOpps = opportunities.filter(
            (opp) => opp.clientId === client.id && opp.stage !== 'Cerrado - Ganado' && opp.stage !== 'Cerrado - Perdido'
          );
          const totalValue = clientOpps.reduce((acc, opp) => acc + opp.value, 0);
          return canViewDetails(client) ? `$${totalValue.toLocaleString('es-AR')}` : '-';
        },
      },
      {
        id: 'actions',
        cell: ({ row }) => {
          const client = row.original;
          return (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon">
                  <MoreHorizontal className="h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent>
                <DropdownMenuItem asChild disabled={!canViewDetails(client)}>
                  <Link href={`/clients/${client.id}`}>Ver detalles</Link>
                </DropdownMenuItem>
                {canManage && (
                  <DropdownMenuItem onClick={(e) => { e.stopPropagation(); setClientsToReassign([client]); }}>
                    <UserCog className="mr-2 h-4 w-4" />
                    Reasignar
                  </DropdownMenuItem>
                )}
                {isBoss && (
                  <DropdownMenuItem className="text-destructive" onClick={(e) => { e.stopPropagation(); setClientToDelete(client); }}>
                    <Trash2 className="mr-2 h-4 w-4" />
                    Eliminar
                  </DropdownMenuItem>
                )}
              </DropdownMenuContent>
            </DropdownMenu>
          );
        },
      }
    ]);
    
    return cols;
  }, [userInfo, isBoss, canManage, opportunities]);

  if (authLoading || loading) {
    return (
      <div className="flex h-full w-full items-center justify-center">
        <Spinner size="large" />
      </div>
    );
  }
  
  const selectedCount = Object.keys(rowSelection).filter(id => rowSelection[id]).length;

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
        {canManage && selectedCount > 0 && (
            <div className="flex items-center gap-2">
                <Button variant="outline" size="sm" onClick={handleOpenReassignDialog}>
                    <UserCog className="mr-2 h-4 w-4" />
                    Reasignar ({selectedCount})
                </Button>
                <Button variant="destructive" size="sm" onClick={handleOpenDeleteDialog}>
                    <Trash2 className="mr-2 h-4 w-4" />
                    Eliminar ({selectedCount})
                </Button>
            </div>
        )}
         <div className="flex items-center space-x-2">
            <Checkbox id="my-clients" checked={showOnlyMyClients} onCheckedChange={(checked) => setShowOnlyMyClients(!!checked)} />
            <Label htmlFor="my-clients" className="whitespace-nowrap text-sm font-medium">Mostrar solo mis clientes</Label>
        </div>
        <Button variant="outline" onClick={() => setShowDuplicates(s => !s)}>
          <CopyCheck className="mr-2 h-4 w-4" />
          {showDuplicates ? 'Ver Todos' : 'Buscar Duplicados'}
        </Button>
        <Button onClick={() => setIsFormOpen(true)}>
          <PlusCircle className="mr-2" />
          Nuevo
        </Button>
      </Header>
      <main className="flex-1 overflow-auto p-4 md:p-6 lg:p-8">
        <ResizableDataTable 
          columns={columns} 
          data={displayedClients}
          sorting={sorting}
          setSorting={setSorting}
          rowSelection={rowSelection}
          setRowSelection={setRowSelection}
          onRowClick={(client) => {
            if (userInfo && (isBoss || client.ownerId === userInfo.id)) {
              router.push(`/clients/${client.id}`);
            }
          }}
          enableRowResizing={false}
        />
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
      clients={clientsToReassign}
      advisors={advisors}
      isOpen={clientsToReassign.length > 0}
      onOpenChange={(open) => !open && setClientsToReassign([])}
      onReassign={handleReassignClient}
    />
     <BulkDeleteDialog
      clients={clientsToDelete}
      isOpen={clientsToDelete.length > 0}
      onOpenChange={(open) => !open && setClientsToDelete([])}
      onConfirm={handleBulkDelete}
      isDeleting={isBulkDeleting}
    />
    </>
  );
}
