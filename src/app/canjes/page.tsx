
'use client';

import React, { useState, useEffect, useCallback, useMemo, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { Header } from '@/components/layout/header';
import { Button } from '@/components/ui/button';
import { PlusCircle } from 'lucide-react';
import { useAuth } from '@/hooks/use-auth';
import { Spinner } from '@/components/ui/spinner';
import type { Canje, Client, User } from '@/lib/types';
import { getCanjes, getClients, getAllUsers, createCanje, updateCanje } from '@/lib/firebase-service';
import { useToast } from '@/hooks/use-toast';
import { ResizableDataTable } from '@/components/ui/resizable-data-table';
import type { ColumnDef, SortingState } from '@tanstack/react-table';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import { CanjeFormDialog } from '@/components/canjes/canje-form-dialog';

const getStatusPill = (status?: string) => {
  if (!status) return null;
  const statusMap: Record<string, string> = {
    'Pedido': 'bg-blue-100 text-blue-800',
    'En gestión': 'bg-yellow-100 text-yellow-800',
    'Completo': 'bg-purple-100 text-purple-800',
    'Aprobado': 'bg-green-100 text-green-800',
  };
  return <Badge variant="outline" className={cn(statusMap[status], 'capitalize')}>{status}</Badge>;
};

function CanjesPageComponent() {
  const { userInfo, loading: authLoading, isBoss, getGoogleAccessToken } = useAuth();
  const { toast } = useToast();
  const searchParams = useSearchParams();
  const canjeIdFromUrl = searchParams.get('id');
  
  const [canjes, setCanjes] = useState<Canje[]>([]);
  const [clients, setClients] = useState<Client[]>([]);
  const [users, setUsers] = useState<User[]>([]);

  const [loading, setLoading] = useState(true);
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [selectedCanje, setSelectedCanje] = useState<Canje | null>(null);
  
  const [sorting, setSorting] = useState<SortingState>([]);
  
  const handleOpenForm = useCallback((canje: Canje | null = null) => {
    setSelectedCanje(canje);
    setIsFormOpen(true);
  }, []);

  const fetchData = useCallback(async () => {
    if (!userInfo) return;
    setLoading(true);
    try {
      const [fetchedCanjes, fetchedClients, fetchedUsers] = await Promise.all([
        getCanjes(),
        getClients(),
        getAllUsers(),
      ]);

      setCanjes(fetchedCanjes);
      setClients(fetchedClients);
      setUsers(fetchedUsers);

      if (canjeIdFromUrl) {
        const canjeToOpen = fetchedCanjes.find(c => c.id === canjeIdFromUrl);
        if (canjeToOpen) {
          handleOpenForm(canjeToOpen);
        }
      }

    } catch (error) {
      console.error("Error fetching data:", error);
      toast({
        title: "Error al cargar datos",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  }, [toast, userInfo, canjeIdFromUrl, handleOpenForm]);

  useEffect(() => {
    if (!authLoading && userInfo) {
      fetchData();
    }
  }, [authLoading, userInfo, fetchData]);
  
  const handleSaveCanje = async (canjeData: Omit<Canje, 'id' | 'fechaCreacion'>, managerEmails?: string[]) => {
    if (!userInfo) return;

    try {
      const token = await getGoogleAccessToken();
      if (selectedCanje) {
        await updateCanje(selectedCanje.id, canjeData, userInfo.id, userInfo.name, token, managerEmails);
        toast({ title: "Canje Actualizado" });
      } else {
        await createCanje(canjeData, userInfo.id, userInfo.name);
        toast({ title: "Canje Creado" });
      }
      fetchData(); // Refresh the list
    } catch (error) {
      console.error("Error saving canje:", error);
      toast({ title: "Error al guardar el canje", variant: "destructive" });
    }
  };
  
  const filteredCanjes = useMemo(() => {
    if (!userInfo) return [];
    if (isBoss) {
      return canjes;
    }
    // Asesores only see their clients' canjes
    const userClientIds = new Set(clients.filter(c => c.ownerId === userInfo.id).map(c => c.id));
    return canjes.filter(canje => userClientIds.has(canje.clienteId));
  }, [canjes, clients, userInfo, isBoss]);


  const columns = useMemo<ColumnDef<Canje>[]>(() => [
    {
      accessorKey: 'titulo',
      header: 'Título',
      cell: ({ row }) => <div className="font-medium">{row.original.titulo}</div>
    },
    {
      accessorKey: 'clienteName',
      header: 'Cliente',
    },
    {
      accessorKey: 'asesorName',
      header: 'Asesor',
    },
    {
      accessorKey: 'estado',
      header: 'Estado',
      cell: ({ row }) => getStatusPill(row.original.estado),
    },
    {
      accessorKey: 'tipo',
      header: 'Tipo',
      cell: ({ row }) => <Badge variant={row.original.tipo === 'Temporario' ? 'secondary' : 'default'}>{row.original.tipo}</Badge>,
    },
    {
      accessorKey: 'valorAsociado',
      header: () => <div className="text-right">Valor Asociado</div>,
      cell: ({ row }) => <div className="text-right">${(row.original.valorAsociado || 0).toLocaleString('es-AR')}</div>,
    },
    {
      accessorKey: 'valorCanje',
      header: () => <div className="text-right">Valor Canje</div>,
      cell: ({ row }) => <div className="text-right">${(row.original.valorCanje || 0).toLocaleString('es-AR')}</div>,
    },
    {
      accessorKey: 'fechaCreacion',
      header: 'Fecha Creación',
      cell: ({ row }) => format(new Date(row.original.fechaCreacion), 'P', { locale: es }),
    },
  ], []);

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
        <Header title="Canjes">
          <Button onClick={() => handleOpenForm()}>
            <PlusCircle className="mr-2" />
            Nuevo Canje
          </Button>
        </Header>
        <main className="flex-1 overflow-auto p-4 md:p-6 lg:p-8">
          <ResizableDataTable
            columns={columns}
            data={filteredCanjes}
            sorting={sorting}
            setSorting={setSorting}
            onRowClick={(canje) => handleOpenForm(canje)}
            getRowId={(row) => row.id}
            enableRowResizing={false}
            emptyStateMessage="No se encontraron canjes."
          />
        </main>
      </div>
      {isFormOpen && (
        <CanjeFormDialog
          isOpen={isFormOpen}
          onOpenChange={setIsFormOpen}
          onSave={handleSaveCanje}
          canje={selectedCanje}
          clients={clients}
          users={users}
          currentUser={userInfo!}
        />
      )}
    </>
  );
}

export default function CanjesPage() {
    return (
        <Suspense fallback={
            <div className="flex h-full w-full items-center justify-center">
                <Spinner size="large" />
            </div>
        }>
            <CanjesPageComponent />
        </Suspense>
    )
}
