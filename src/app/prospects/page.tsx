
'use client';

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { Header } from '@/components/layout/header';
import { Button } from '@/components/ui/button';
import { PlusCircle, UserPlus, MoreHorizontal, Trash2 } from 'lucide-react';
import { useAuth } from '@/hooks/use-auth';
import { Spinner } from '@/components/ui/spinner';
import type { Prospect, User, Client } from '@/lib/types';
import { getProspects, createProspect, updateProspect, deleteProspect, getAllUsers, createClient } from '@/lib/firebase-service';
import { useToast } from '@/hooks/use-toast';
import { ResizableDataTable } from '@/components/ui/resizable-data-table';
import type { ColumnDef, SortingState } from '@tanstack/react-table';
import { Badge } from '@/components/ui/badge';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { ProspectFormDialog } from '@/components/prospects/prospect-form-dialog';
import { ClientFormDialog } from '@/components/clients/client-form-dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';

export default function ProspectsPage() {
  const { userInfo, loading: authLoading, isBoss } = useAuth();
  const { toast } = useToast();

  const [prospects, setProspects] = useState<Prospect[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [selectedProspect, setSelectedProspect] = useState<Prospect | null>(null);
  
  const [isConverting, setIsConverting] = useState(false);
  const [prospectToConvert, setProspectToConvert] = useState<Prospect | null>(null);
  
  const [prospectToDelete, setProspectToDelete] = useState<Prospect | null>(null);
  const [sorting, setSorting] = useState<SortingState>([]);

  const [selectedAdvisor, setSelectedAdvisor] = useState('all');
  const [hideConverted, setHideConverted] = useState(true);

  const fetchData = useCallback(async () => {
    if (!userInfo) return;
    setLoading(true);
    try {
      const allowedOwnerRoles = ['Asesor', 'Jefe', 'Gerencia', 'Administracion'];
      const [fetchedProspects, fetchedUsers] = await Promise.all([
        getProspects(),
        getAllUsers(),
      ]);
      setProspects(fetchedProspects);
      setUsers(fetchedUsers.filter(u => allowedOwnerRoles.includes(u.role)));
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
      await updateProspect(prospectToConvert.id, { status: 'Convertido' }, userInfo.id, userInfo.name);
      toast({ title: "Prospecto Convertido", description: `${prospectToConvert.companyName} ahora es un cliente.`});
      setIsConverting(false);
      setProspectToConvert(null);
      fetchData();
    }
  };

  const filteredProspects = useMemo(() => {
    if (!userInfo) return [];
    let userProspects = prospects;

    if (!isBoss) {
      userProspects = prospects.filter(p => p.ownerId === userInfo.id);
    } else if (selectedAdvisor !== 'all') {
      userProspects = prospects.filter(p => p.ownerId === selectedAdvisor);
    }
    
    if (hideConverted) {
      userProspects = userProspects.filter(p => p.status !== 'Convertido');
    }

    return userProspects;
  }, [prospects, userInfo, isBoss, selectedAdvisor, hideConverted]);


  const columns = useMemo<ColumnDef<Prospect>[]>(() => [
    {
      accessorKey: 'companyName',
      header: 'Empresa',
      cell: ({ row }) => <div className="font-medium">{row.original.companyName}</div>
    },
    {
      accessorKey: 'contactName',
      header: 'Contacto',
      cell: ({ row }) => (
        <div>
          <p>{row.original.contactName}</p>
          <p className="text-xs text-muted-foreground">{row.original.contactPhone}</p>
          <p className="text-xs text-muted-foreground">{row.original.contactEmail}</p>
        </div>
      )
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
        if (!canEdit || prospect.status === 'Convertido') return null;

        return (
          <div className="flex items-center gap-2">
            <Button size="sm" variant="outline" onClick={() => handleConvertProspect(prospect)}>
              <UserPlus className="mr-2 h-4 w-4" />
              Convertir a Cliente
            </Button>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" className="h-8 w-8 p-0">
                  <span className="sr-only">Abrir menú</span>
                  <MoreHorizontal className="h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onClick={() => handleOpenForm(prospect)}>
                  Editar
                </DropdownMenuItem>
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
          {isBoss && (
            <Select value={selectedAdvisor} onValueChange={setSelectedAdvisor}>
              <SelectTrigger className="w-full sm:w-[200px]">
                <SelectValue placeholder="Filtrar por asesor" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos los asesores</SelectItem>
                {users.map(advisor => (
                  <SelectItem key={advisor.id} value={advisor.id}>{advisor.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
           <div className="flex items-center space-x-2">
            <Checkbox id="hide-converted" checked={hideConverted} onCheckedChange={(checked) => setHideConverted(!!checked)} />
            <Label htmlFor="hide-converted" className="whitespace-nowrap text-sm font-medium">Ocultar Convertidos</Label>
        </div>
          <Button onClick={() => handleOpenForm()}>
            <PlusCircle className="mr-2" />
            Nuevo Prospecto
          </Button>
        </Header>
        <main className="flex-1 overflow-auto p-4 md:p-6 lg:p-8">
          <ResizableDataTable
            columns={columns}
            data={filteredProspects}
            sorting={sorting}
            setSorting={setSorting}
            onRowClick={(prospect) => {
              if (isBoss || userInfo?.id === prospect.ownerId) {
                handleOpenForm(prospect);
              }
            }}
            getRowId={(row) => row.id}
            enableRowResizing={false}
            emptyStateMessage="No se encontraron prospectos."
          />
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
            onSave={async (clientData) => {
              if (!userInfo) return;
              try {
                await createClient(
                  clientData, 
                  prospectToConvert.ownerId, 
                  prospectToConvert.ownerName
                );
                await handleClientCreatedFromProspect();
              } catch(e) {
                toast({title: "Error al convertir prospecto", description: "No se pudo crear el cliente.", variant: "destructive"});
              }
            }}
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
    </>
  );
}
