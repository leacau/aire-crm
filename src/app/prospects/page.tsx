

'use client';

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { Header } from '@/components/layout/header';
import { Button } from '@/components/ui/button';
import { PlusCircle, UserPlus, MoreHorizontal, Trash2, FolderX, Search, Activity } from 'lucide-react';
import { useAuth } from '@/hooks/use-auth';
import { Spinner } from '@/components/ui/spinner';
import type { Prospect, User, Client } from '@/lib/types';
import { getProspects, createProspect, updateProspect, deleteProspect, getAllUsers } from '@/lib/firebase-service';
import { useToast } from '@/hooks/use-toast';
import { ResizableDataTable } from '@/components/ui/resizable-data-table';
import type { ColumnDef, SortingState } from '@tanstack/react-table';
import { Badge } from '@/components/ui/badge';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { ProspectFormDialog } from '@/components/prospects/prospect-form-dialog';
import { ClientFormDialog } from '@/components/clients/client-form-dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { ActivityFormDialog } from '@/components/clients/activity-form-dialog';
import { isManagementRoleName } from '@/lib/role-utils';


export default function ProspectsPage() {
  const { userInfo, loading: authLoading, isBoss, getGoogleAccessToken } = useAuth();
  const { toast } = useToast();

  const [prospects, setProspects] = useState<Prospect[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [selectedProspect, setSelectedProspect] = useState<Prospect | null>(null);
  
  const [isConverting, setIsConverting] = useState(false);
  const [prospectToConvert, setProspectToConvert] = useState<Prospect | null>(null);
  
  const [prospectToDelete, setProspectToDelete] = useState<Prospect | null>(null);
  const [prospectToArchive, setProspectToArchive] = useState<Prospect | null>(null);
  const [sorting, setSorting] = useState<SortingState>([]);

  const [selectedAdvisor, setSelectedAdvisor] = useState('all');
  const [searchTerm, setSearchTerm] = useState('');
  const [showOnlyMyProspects, setShowOnlyMyProspects] = useState(!isBoss);
  
  const [isActivityFormOpen, setIsActivityFormOpen] = useState(false);
  const [selectedProspectForActivity, setSelectedProspectForActivity] = useState<Prospect | null>(null);
  
  useEffect(() => {
    if (userInfo) {
      setShowOnlyMyProspects(!isBoss);
    }
  }, [isBoss, userInfo]);

  const fetchData = useCallback(async () => {
    if (!userInfo) return;
    setLoading(true);
    try {
      const [fetchedProspects, fetchedUsers] = await Promise.all([
        getProspects(),
        getAllUsers(),
      ]);
      setProspects(fetchedProspects);
      setUsers(fetchedUsers.filter(u => u.role === 'Asesor' || isManagementRoleName(u.role)));
    } catch (error) {
      console.error("Error fetching data:", error);
      toast({ title: "Error al cargar los prospectos", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }, [toast, userInfo]);

  useEffect(() => {
    if (!authLoading && userInfo) {
      fetchData();
    }
  }, [authLoading, userInfo, fetchData]);

  const handleOpenForm = (prospect: Prospect | null = null) => {
    setSelectedProspect(prospect);
    setIsFormOpen(true);
  };

  const handleSaveProspect = async (prospectData: Omit<Prospect, 'id' | 'createdAt' | 'ownerId' | 'ownerName'>) => {
    if (!userInfo) return;
    try {
      if (selectedProspect) {
        await updateProspect(selectedProspect.id, prospectData, userInfo.id, userInfo.name);
        toast({ title: "Prospecto Actualizado" });
      } else {
        await createProspect(prospectData, userInfo.id, userInfo.name);
        toast({ title: "Prospecto Creado" });
      }
      fetchData();
    } catch (error) {
      console.error("Error saving prospect:", error);
      toast({ title: "Error al guardar el prospecto", variant: "destructive" });
    }
  };

  const handleDeleteProspect = async () => {
    if (!prospectToDelete || !userInfo) return;
    try {
      await deleteProspect(prospectToDelete.id, userInfo.id, userInfo.name);
      toast({ title: "Prospecto Eliminado" });
      fetchData();
    } catch (error) {
      console.error("Error deleting prospect:", error);
      toast({ title: "Error al eliminar", variant: "destructive" });
    } finally {
      setProspectToDelete(null);
    }
  };

  const handleConvertProspect = (prospect: Prospect) => {
    setProspectToConvert(prospect);
    setIsConverting(true);
  };
  
  const handleClientCreatedFromProspect = async () => {
    if (prospectToConvert && userInfo) {
      try {
        await updateProspect(prospectToConvert.id, { status: 'Convertido', statusChangedAt: new Date().toISOString() }, userInfo.id, userInfo.name);
        toast({ title: "Prospecto Convertido", description: `${prospectToConvert.companyName} ahora es un cliente.`});
        fetchData();
      } catch (error) {
        console.error("Error updating prospect status:", error);
        toast({ title: "Error al actualizar el estado del prospecto", variant: "destructive" });
      } finally {
        setIsConverting(false);
        setProspectToConvert(null);
      }
    }
  };

  const handleArchiveProspect = async () => {
    if (!prospectToArchive || !userInfo) return;
    try {
      await updateProspect(prospectToArchive.id, { status: 'No Próspero', statusChangedAt: new Date().toISOString() }, userInfo.id, userInfo.name);
      toast({ title: "Prospecto Archivado" });
      fetchData();
    } catch (error) {
      console.error("Error archiving prospect:", error);
      toast({ title: "Error al archivar", variant: "destructive" });
    } finally {
      setProspectToArchive(null);
    }
  };

   const handleOpenActivityForm = (prospect: Prospect) => {
    setSelectedProspectForActivity(prospect);
    setIsActivityFormOpen(true);
  };


  const advisorsWithProspects = useMemo(() => {
    if (!isBoss) return [];
    const advisorIdsWithProspects = new Set(prospects.map(p => p.ownerId));
    return users.filter(user => advisorIdsWithProspects.has(user.id));
  }, [prospects, users, isBoss]);

  const filteredProspects = useMemo(() => {
    if (!userInfo) return { active: [], notProsperous: [], converted: [] };

    let userProspects = prospects;
    
    if (showOnlyMyProspects) {
        userProspects = userProspects.filter(p => p.ownerId === userInfo.id);
    } else if (isBoss && selectedAdvisor !== 'all') {
        userProspects = userProspects.filter(p => p.ownerId === selectedAdvisor);
    }
    
    if (searchTerm.length >= 3) {
      const lowercasedFilter = searchTerm.toLowerCase();
      userProspects = userProspects.filter(p => 
        p.companyName.toLowerCase().includes(lowercasedFilter) ||
        p.contactName?.toLowerCase().includes(lowercasedFilter) ||
        p.contactPhone?.toLowerCase().includes(lowercasedFilter) ||
        p.contactEmail?.toLowerCase().includes(lowercasedFilter)
      );
    }

    return {
      active: userProspects.filter(p => p.status !== 'Convertido' && p.status !== 'No Próspero'),
      notProsperous: userProspects.filter(p => p.status === 'No Próspero'),
      converted: userProspects.filter(p => p.status === 'Convertido'),
    };
  }, [prospects, userInfo, isBoss, selectedAdvisor, searchTerm, showOnlyMyProspects]);


  const columns = useMemo<ColumnDef<Prospect>[]>(() => [
    {
      accessorKey: 'companyName',
      header: 'Empresa',
      cell: ({ row }) => <div className="font-medium">{row.original.companyName}</div>
    },
    {
      accessorKey: 'contactName',
      header: 'Contacto',
      cell: ({ row }) => {
        const prospect = row.original;
        const canViewContactInfo = isBoss || userInfo?.id === prospect.ownerId;
        return (
            <div>
              <p>{prospect.contactName}</p>
              <p className="text-xs text-muted-foreground">
                {canViewContactInfo ? prospect.contactPhone : 'Información protegida'}
              </p>
              <p className="text-xs text-muted-foreground">
                {canViewContactInfo ? prospect.contactEmail : 'Información protegida'}
              </p>
            </div>
        )
      }
    },
    {
      accessorKey: 'ownerName',
      header: 'Asesor',
    },
    {
      accessorKey: 'status',
      header: 'Estado',
      cell: ({ row }) => <Badge variant="secondary">{row.original.status}</Badge>,
    },
    {
      accessorKey: 'createdAt',
      header: 'Fecha de Creación',
      cell: ({ row }) => format(new Date(row.original.createdAt), 'P', { locale: es }),
    },
    {
      id: 'actions',
      cell: ({ row }) => {
        const prospect = row.original;
        const canEdit = isBoss || userInfo?.id === prospect.ownerId;
        if (!canEdit) return null;

        return (
          <div className="flex items-center justify-end gap-2">
             <Button variant="ghost" size="icon" className="h-8 w-8" onClick={(e) => { e.stopPropagation(); handleOpenActivityForm(prospect); }}>
                <Activity className="h-4 w-4" />
            </Button>
            {prospect.status !== 'Convertido' && (
               <Button size="sm" variant="outline" onClick={(e) => { e.stopPropagation(); handleConvertProspect(prospect); }}>
                <UserPlus className="mr-2 h-4 w-4" />
                Convertir a Cliente
              </Button>
            )}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" className="h-8 w-8 p-0" onClick={(e) => e.stopPropagation()}>
                  <span className="sr-only">Abrir menú</span>
                  <MoreHorizontal className="h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                {prospect.status !== 'Convertido' &&
                  <DropdownMenuItem onClick={(e) => { e.stopPropagation(); handleOpenForm(prospect); }}>
                    Editar
                  </DropdownMenuItem>
                }
                {prospect.status !== 'No Próspero' && prospect.status !== 'Convertido' &&
                    <DropdownMenuItem onClick={(e) => { e.stopPropagation(); setProspectToArchive(prospect); }}>
                        <FolderX className="mr-2 h-4 w-4" />
                        Marcar como No Próspero
                    </DropdownMenuItem>
                }
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  className="text-destructive"
                  onClick={(e) => { e.stopPropagation(); setProspectToDelete(prospect); }}
                >
                  <Trash2 className="mr-2 h-4 w-4" />
                  Eliminar
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        );
      },
    },
  ], [handleOpenForm, isBoss, userInfo]);

  if (authLoading || loading) {
    return <div className="flex h-full w-full items-center justify-center"><Spinner size="large" /></div>;
  }

  return (
    <>
      <div className="flex flex-col h-full">
        <Header title="Prospectos">
          <div className="relative ml-auto flex-1 md:grow-0">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
                type="search"
                placeholder="Buscar prospectos..."
                className="w-full rounded-lg bg-background pl-8 md:w-[200px] lg:w-[330px]"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>
          {isBoss && (
            <Select value={selectedAdvisor} onValueChange={setSelectedAdvisor} disabled={showOnlyMyProspects}>
              <SelectTrigger className="w-full sm:w-[200px]">
                <SelectValue placeholder="Filtrar por asesor" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos los asesores</SelectItem>
                {advisorsWithProspects.map(advisor => (
                  <SelectItem key={advisor.id} value={advisor.id}>{advisor.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
           <div className="flex items-center space-x-2">
            <Checkbox id="my-prospects" name="my-prospects" checked={showOnlyMyProspects} onCheckedChange={(checked) => setShowOnlyMyProspects(!!checked)} />
            <Label htmlFor="my-prospects" className="whitespace-nowrap text-sm font-medium">Mostrar solo mis prospectos</Label>
          </div>
          <Button onClick={() => handleOpenForm()}>
            <PlusCircle className="mr-2" />
            Nuevo Prospecto
          </Button>
        </Header>
        <main className="flex-1 overflow-auto p-4 md:p-6 lg:p-8">
            <Tabs defaultValue="active">
                <TabsList className="grid w-full grid-cols-3">
                    <TabsTrigger value="active">Activos ({filteredProspects.active.length})</TabsTrigger>
                    <TabsTrigger value="not-prosperous">No Prósperos ({filteredProspects.notProsperous.length})</TabsTrigger>
                    <TabsTrigger value="converted">Convertidos ({filteredProspects.converted.length})</TabsTrigger>
                </TabsList>
                <TabsContent value="active">
                    <ResizableDataTable
                        columns={columns}
                        data={filteredProspects.active}
                        sorting={sorting}
                        setSorting={setSorting}
                        onRowClick={(prospect) => (isBoss || userInfo?.id === prospect.ownerId) && handleOpenForm(prospect)}
                        getRowId={(row) => row.id}
                        enableRowResizing={false}
                        emptyStateMessage="No se encontraron prospectos activos."
                    />
                </TabsContent>
                <TabsContent value="not-prosperous">
                     <ResizableDataTable
                        columns={columns}
                        data={filteredProspects.notProsperous}
                        onRowClick={(prospect) => (isBoss || userInfo?.id === prospect.ownerId) && handleOpenForm(prospect)}
                        getRowId={(row) => row.id}
                        enableRowResizing={false}
                        emptyStateMessage="No hay prospectos en esta categoría."
                    />
                </TabsContent>
                 <TabsContent value="converted">
                     <ResizableDataTable
                        columns={columns}
                        data={filteredProspects.converted}
                        getRowId={(row) => row.id}
                        onRowClick={(prospect) => (isBoss || userInfo?.id === prospect.ownerId) && handleOpenForm(prospect)}
                        enableRowResizing={false}
                        emptyStateMessage="No hay prospectos convertidos."
                    />
                </TabsContent>
            </Tabs>
        </main>
      </div>

      <ProspectFormDialog
        isOpen={isFormOpen}
        onOpenChange={setIsFormOpen}
        onSave={handleSaveProspect}
        prospect={selectedProspect}
      />
      
      {prospectToConvert && (
         <ClientFormDialog
            isOpen={isConverting}
            onOpenChange={setIsConverting}
            onSaveSuccess={handleClientCreatedFromProspect}
            client={{
              denominacion: prospectToConvert.companyName,
              razonSocial: prospectToConvert.companyName,
              email: prospectToConvert.contactEmail || '',
              phone: prospectToConvert.contactPhone || '',
              observaciones: prospectToConvert.notes || '',
              ownerId: prospectToConvert.ownerId,
              ownerName: prospectToConvert.ownerName,
            } as Partial<Client>}
            onValidateCuit={async () => false} 
        />
      )}

      {selectedProspectForActivity && userInfo && (
        <ActivityFormDialog
            isOpen={isActivityFormOpen}
            onOpenChange={setIsActivityFormOpen}
            entity={{ id: selectedProspectForActivity.id, name: selectedProspectForActivity.companyName, type: 'prospect' }}
            userInfo={userInfo}
            getGoogleAccessToken={getGoogleAccessToken}
            onActivitySaved={() => fetchData()}
        />
      )}

      <AlertDialog open={!!prospectToDelete} onOpenChange={(open) => !open && setProspectToDelete(null)}>
        <AlertDialogContent>
            <AlertDialogHeader>
                <AlertDialogTitle>¿Estás seguro de eliminar este prospecto?</AlertDialogTitle>
                <AlertDialogDescription>
                    Esta acción es irreversible y eliminará permanentemente a "{prospectToDelete?.companyName}".
                </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
                <AlertDialogCancel>Cancelar</AlertDialogCancel>
                <AlertDialogAction onClick={handleDeleteProspect} variant="destructive">
                    Eliminar
                </AlertDialogAction>
            </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      
       <AlertDialog open={!!prospectToArchive} onOpenChange={(open) => !open && setProspectToArchive(null)}>
        <AlertDialogContent>
            <AlertDialogHeader>
                <AlertDialogTitle>¿Marcar como "No Próspero"?</AlertDialogTitle>
                <AlertDialogDescription>
                    Se moverá a "{prospectToArchive?.companyName}" a la pestaña de "No Prósperos". Podrás reactivarlo o convertirlo en cliente más adelante.
                </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
                <AlertDialogCancel>Cancelar</AlertDialogCancel>
                <AlertDialogAction onClick={handleArchiveProspect}>
                    Confirmar
                </AlertDialogAction>
            </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
