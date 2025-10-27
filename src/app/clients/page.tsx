

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
import { getClients, deleteClient, getAllUsers, updateClient, bulkDeleteClients, bulkUpdateClients, getAllOpportunities } from '@/lib/firebase-service';
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
import { Badge } from '@/components/ui/badge';

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
          <Button onClick={handleSave} disabled={isSaving}>
            {isSaving ? <Spinner size="small" /> : "Reasignar"}
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

function BulkDeleteDialog({
    isOpen,
    onOpenChange,
    onConfirm,
    isDeleting,
    count
}: {
    isOpen: boolean,
    onOpenChange: (open: boolean) => void,
    onConfirm: () => void,
    isDeleting: boolean,
    count: number
}) {
    if (!isOpen) return null;
    return (
        <AlertDialog open={isOpen} onOpenChange={onOpenChange}>
            <AlertDialogContent>
                <AlertDialogHeader>
                    <AlertDialogTitle>¿Estás realmente seguro?</AlertDialogTitle>
                    <AlertDialogDescription>
                        Esta acción es irreversible. Se eliminarán permanentemente <strong>{count} cliente(s)</strong> y todas sus oportunidades y contactos asociados.
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
  const [clientsToReassign, setClientsToReassign] = useState<Client[]>([]);
  const [showOnlyMyClients, setShowOnlyMyClients] = useState(!isBoss);
  const canManage = isBoss || userInfo?.role === 'Administracion' || userInfo?.role === 'Gerencia';
  const [sorting, setSorting] = useState<SortingState>([]);
  const [rowSelection, setRowSelection] = React.useState<RowSelectionState>({});
  const [showDuplicates, setShowDuplicates] = useState(false);
  const [isBulkDeleting, setIsBulkDeleting] = useState(false);
  const [isBulkDeleteDialogOpen, setIsBulkDeleteDialogOpen] = useState(false);
  const [selectedAdvisor, setSelectedAdvisor] = useState('all');


  const fetchData = useCallback(async () => {
    if (!userInfo) return;
    setLoading(true);
    try {
      const allowedOwnerRoles = ['Asesor', 'Jefe', 'Gerencia', 'Administracion'];
      const promises: [Promise<Client[]>, Promise<User[]>, Promise<Opportunity[]>?] = [getClients(), getAllUsers()];
      
      const shouldFetchAllData = userInfo.role === 'Jefe' || userInfo.role === 'Gerencia' || userInfo.role === 'Administracion';

      if (shouldFetchAllData) {
        promises.push(getAllOpportunities());
      }
      
      const [fetchedClients, fetchedUsers, fetchedOpportunities] = await Promise.all(promises);

      setClients(fetchedClients);
      if(fetchedUsers) {
        setAdvisors(fetchedUsers.filter(u => allowedOwnerRoles.includes(u.role)));
      }
      if (fetchedOpportunities) {
        setOpportunities(fetchedOpportunities);
      }
    } catch (error) {
      console.error("Error fetching data:", error);
      toast({
        title: "Error al cargar datos",
        description: "No se pudieron cargar los datos de clientes.",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  }, [toast, userInfo]);

  useEffect(() => {
    if (!authLoading && userInfo) {
      fetchData();
    }
  }, [authLoading, userInfo, fetchData]);
  
  useEffect(() => {
    if (userInfo) {
      setShowOnlyMyClients(!isBoss);
    }
  }, [isBoss, userInfo]);

  useEffect(() => {
    setRowSelection({});
  }, [searchTerm, showOnlyMyClients, showDuplicates, selectedAdvisor]);
  
   const clientOpportunityData = useMemo(() => {
    if (opportunities.length === 0) return {};

    const data: Record<string, { openOpps: number; totalValue: number }> = {};
    
    clients.forEach(client => {
      data[client.id] = { openOpps: 0, totalValue: 0 };
    });

    opportunities.forEach(opp => {
      if (data[opp.clientId]) {
        if (!['Cerrado - Ganado', 'Cerrado - Perdido', 'Cerrado - No Definido'].includes(opp.stage)) {
            data[opp.clientId].openOpps += 1;
            data[opp.clientId].totalValue += opp.value;
        }
      }
    });

    return data;
  }, [opportunities, clients]);

  const advisorsWithClients = useMemo(() => {
    if (!canManage) return [];
    const ownerIdsWithClients = new Set(clients.map(client => client.ownerId));
    return advisors.filter(advisor => ownerIdsWithClients.has(advisor.id));
  }, [clients, advisors, canManage]);


  const displayedClients = useMemo(() => {
    let clientsToShow = clients;

    if (showOnlyMyClients && userInfo) {
        clientsToShow = clientsToShow.filter(client => client.ownerId === userInfo.id);
    } else if (canManage && selectedAdvisor !== 'all') {
        clientsToShow = clientsToShow.filter(client => client.ownerId === selectedAdvisor);
    }

    if (showDuplicates) {
        const potentialDuplicates = new Set<string>();
        const allClientNames = clientsToShow.map(c => ({ id: c.id, name: c.denominacion, rz: c.razonSocial }));

        clientsToShow.forEach(client => {
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
        
        clientsToShow = clientsToShow.filter(c => potentialDuplicates.has(c.id));
    }


    if (searchTerm.length < 3) {
      return clientsToShow;
    }
    const lowercasedFilter = searchTerm.toLowerCase();
    return clientsToShow.filter(client => {
      const denominacion = client.denominacion || '';
      const razonSocial = client.razonSocial || '';
      const cuit = client.cuit || '';
      return (
        denominacion.toLowerCase().includes(lowercasedFilter) ||
        razonSocial.toLowerCase().includes(lowercasedFilter) ||
        cuit.includes(lowercasedFilter)
      );
    });
  }, [clients, searchTerm, showOnlyMyClients, userInfo, showDuplicates, canManage, selectedAdvisor]);
  
  const handleBulkDelete = async () => {
    const idsToDelete = Object.keys(rowSelection);
    if (idsToDelete.length === 0 || !userInfo) return;

    setIsBulkDeleting(true);
    try {
        await bulkDeleteClients(idsToDelete, userInfo.id, userInfo.name);
        toast({ title: `${idsToDelete.length} cliente(s) eliminado(s)` });
        await fetchData();
        setRowSelection({}); 
    } catch (error) {
        console.error("Error bulk deleting clients:", error);
        toast({ title: "Error al eliminar clientes", description: (error as Error).message, variant: "destructive" });
    } finally {
        setIsBulkDeleting(false);
        setIsBulkDeleteDialogOpen(false);
    }
  }

  const handleReassignClient = async (newOwnerId: string) => {
    const clientsToUpdate = clientsToReassign;

    if (clientsToUpdate.length === 0 || !userInfo || !canManage) return;
    
    const newOwner = advisors.find(a => a.id === newOwnerId);
    if (!newOwner) {
      toast({ title: 'Asesor no encontrado', variant: 'destructive' });
      return;
    }
    
    const updates = clientsToUpdate.map(client => ({
        id: client.id,
        denominacion: client.denominacion,
        data: { ownerId: newOwner.id, ownerName: newOwner.name }
    }));

    try {
      await bulkUpdateClients(updates, userInfo.id, userInfo.name);
      toast({ title: "Clientes Reasignados", description: `${clientsToUpdate.length} cliente(s) han sido asignado(s) a ${newOwner.name}.`});
      fetchData();
      setRowSelection({});
      setClientsToReassign([]);
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
    const selectedClientIds = Object.keys(rowSelection);
    const selectedClients = clients.filter(client => selectedClientIds.includes(client.id));
    if (selectedClients.length > 0) {
      setClientsToReassign(selectedClients);
    }
  };
  
  const columns = useMemo<ColumnDef<Client>[]>(() => {
    const canViewDetails = (client: Client) => userInfo && client && (isBoss || client.ownerId === userInfo.id);
    const canSeeOppData = userInfo?.role === 'Jefe' || userInfo?.role === 'Gerencia' || userInfo?.role === 'Administracion';


    let cols: ColumnDef<Client>[] = [];

    if (canManage) {
        cols.push({
            id: 'select',
            header: ({ table }) => (
                <Checkbox
                    id="select-all-clients-checkbox"
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
                    onClick={(e) => e.stopPropagation()}
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
               <div className="flex items-center gap-2 mt-1">
                 {userInfo && client.ownerId !== userInfo.id && (
                    <p className="text-xs text-muted-foreground">{client.ownerName}</p>
                 )}
                 {client.isDeactivated && <Badge variant="destructive">Baja</Badge>}
               </div>
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
        id: 'openOpps',
        accessorKey: 'openOpps',
        header: 'Negocios Abiertos',
        enableSorting: true,
        cell: ({ row }) => {
          if (!canSeeOppData) return '-';
          const data = clientOpportunityData[row.original.id];
          return data ? data.openOpps : 0;
        },
      },
      {
        id: 'totalValue',
        accessorKey: 'totalValue',
        header: 'Valor Total',
        enableSorting: true,
        cell: ({ row }) => {
           if (!canSeeOppData) return '-';
          const data = clientOpportunityData[row.original.id];
          return data ? `$${data.totalValue.toLocaleString('es-AR')}` : '$0';
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
                  <DropdownMenuItem className="text-destructive" onClick={(e) => { e.stopPropagation(); setRowSelection({[client.id]: true}); setIsBulkDeleteDialogOpen(true);}}>
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
  }, [userInfo, isBoss, canManage, clientOpportunityData]);

  if (authLoading || loading) {
    return (
      <div className="flex h-full w-full items-center justify-center">
        <Spinner size="large" />
      </div>
    );
  }
  
  const selectedCount = Object.keys(rowSelection).length;

  return (
    <>
    <div className="flex flex-col h-full">
      <Header title="Clientes">
         <div className="relative ml-auto flex-1 md:grow-0">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
                type="search"
                placeholder="Buscar por Denominación, Razón Social o CUIT..."
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
                <Button variant="destructive" size="sm" onClick={() => setIsBulkDeleteDialogOpen(true)}>
                    <Trash2 className="mr-2 h-4 w-4" />
                    Eliminar ({selectedCount})
                </Button>
            </div>
        )}
        {canManage && (
          <Select value={selectedAdvisor} onValueChange={setSelectedAdvisor} disabled={showOnlyMyClients}>
            <SelectTrigger className="w-full sm:w-[200px]">
              <SelectValue placeholder="Filtrar por asesor" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos los asesores</SelectItem>
              {advisorsWithClients.map(advisor => (
                <SelectItem key={advisor.id} value={advisor.id}>{advisor.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
         <div className="flex items-center space-x-2">
            <Checkbox id="my-clients" name="my-clients" checked={showOnlyMyClients} onCheckedChange={(checked) => setShowOnlyMyClients(!!checked)} />
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
            if (userInfo && client && (isBoss || client.ownerId === userInfo.id)) {
              router.push(`/clients/${client.id}`);
            }
          }}
          getRowId={(row) => row.id}
          enableRowResizing={false}
        />
      </main>
      <ClientFormDialog
        isOpen={isFormOpen}
        onOpenChange={setIsFormOpen}
        onSaveSuccess={() => {
          fetchData();
          setIsFormOpen(false);
        }}
        onValidateCuit={validateCuit}
      />
    </div>
    <ReassignClientDialog 
      clients={clientsToReassign}
      advisors={advisors}
      isOpen={clientsToReassign.length > 0}
      onOpenChange={(open) => !open && setClientsToReassign([])}
      onReassign={handleReassignClient}
    />
     <BulkDeleteDialog
        isOpen={isBulkDeleteDialogOpen}
        onOpenChange={setIsBulkDeleteDialogOpen}
        onConfirm={handleBulkDelete}
        isDeleting={isBulkDeleting}
        count={selectedCount}
    />
    </>
  );
}
