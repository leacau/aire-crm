

'use client';

import React, { useState, useEffect, useCallback, useMemo, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { Header } from '@/components/layout/header';
import { Button } from '@/components/ui/button';
import { MoreHorizontal, PlusCircle, Trash2, RefreshCw } from 'lucide-react';
import { useAuth } from '@/hooks/use-auth';
import { Spinner } from '@/components/ui/spinner';
import type { Canje, Client, User } from '@/lib/types';
import { getCanjes, getClients, getAllUsers, createCanje, updateCanje, deleteCanje, migrateLegacyConveniosToCanjes, getWorkflowAssignments } from '@/lib/firebase-service';
import { useToast } from '@/hooks/use-toast';
import { sendEmail } from '@/lib/google-gmail-service';
import { ResizableDataTable } from '@/components/ui/resizable-data-table';
import type { ColumnDef, SortingState } from '@tanstack/react-table';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import { CanjeFormDialog } from '@/components/canjes/canje-form-dialog';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';


const getStatusPill = (status?: string) => {
  if (!status) return null;
  const statusMap: Record<string, string> = {
    'Pedido': 'bg-blue-100 text-blue-800',
    'En gestión': 'bg-yellow-100 text-yellow-800',
    'Culminado': 'bg-purple-100 text-purple-800',
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
  const [canjeToDelete, setCanjeToDelete] = useState<Canje | null>(null);
  const [migrating, setMigrating] = useState(false);
  
  const canManageAll = isBoss || userInfo?.role === 'Administracion';

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

  const notifyCanjeReceivers = async (canjeId: string, canjeData: Omit<Canje, 'id' | 'fechaCreacion'>) => {
    try {
      const accessToken = await getGoogleAccessToken({ silent: true });
      if (!accessToken || !userInfo) return;

      const assignments = await getWorkflowAssignments();
      const recipients = assignments.canjeRequestReceivers
        .map(userId => users.find(user => user.id === userId)?.email)
        .filter((email): email is string => Boolean(email));

      if (recipients.length === 0) return;

      const canjeUrl = `${window.location.origin}/canjes?id=${encodeURIComponent(canjeId)}`;
      await sendEmail({
        accessToken,
        to: Array.from(new Set(recipients)),
        subject: `Nuevo pedido de canje - ${canjeData.titulo}`,
        body: `
          <div style="font-family: Arial, sans-serif; color: #333; max-width: 640px; border: 1px solid #e2e8f0; padding: 20px; border-radius: 8px;">
            <h2 style="margin: 0 0 12px; color: #0f172a;">Nuevo pedido de canje</h2>
            <p><strong>${userInfo.name}</strong> cargó un nuevo pedido para evaluación.</p>
            <p><strong>Título:</strong> ${canjeData.titulo}<br/>
            <strong>Solicitante:</strong> ${canjeData.solicitanteCanje || '-'}<br/>
            <strong>Necesidad:</strong> ${canjeData.necesidadOrganizacion || '-'}</p>
            <p><strong>Detalle:</strong><br/>${(canjeData.pedido || '').replace(/\n/g, '<br/>')}</p>
            <p style="margin-top: 16px;"><a href="${canjeUrl}" style="display: inline-block; padding: 10px 16px; background: #1d4ed8; color: #fff; text-decoration: none; border-radius: 4px; font-weight: bold;">Ver pedido de canje</a></p>
          </div>
        `,
        fromName: userInfo.name,
        fromEmail: userInfo.email,
        replyTo: userInfo.email,
      });
    } catch (error) {
      console.error('Error notifying canje receivers:', error);
    }
  };
  
  const handleSaveCanje = async (canjeData: Omit<Canje, 'id' | 'fechaCreacion'>) => {
    if (!userInfo) return;

    try {
      if (selectedCanje) {
        await updateCanje(selectedCanje.id, canjeData, userInfo.id, userInfo.name);
        toast({ title: "Canje Actualizado" });
      } else {
        const canjeId = await createCanje(canjeData, userInfo.id, userInfo.name);
        await notifyCanjeReceivers(canjeId, canjeData);
        toast({ title: "Canje Creado" });
      }
      fetchData(); // Refresh the list
    } catch (error) {
      console.error("Error saving canje:", error);
      toast({ title: "Error al guardar el canje", variant: "destructive" });
    }
  };

  const handleDeleteCanje = async () => {
    if (!canjeToDelete || !userInfo) return;
    try {
      await deleteCanje(canjeToDelete.id, userInfo.id, userInfo.name);
      toast({ title: "Canje Eliminado" });
      fetchData();
    } catch (error) {
      console.error("Error deleting canje:", error);
      toast({ title: "Error al eliminar", variant: "destructive" });
    } finally {
      setCanjeToDelete(null);
    }
  };

  const handleMigrateLegacy = async () => {
    if (!userInfo || !canManageAll) return;
    setMigrating(true);
    try {
      const result = await migrateLegacyConveniosToCanjes(userInfo.id, userInfo.name);
      toast({
        title: 'Integración finalizada',
        description: `${result.created} canjes incorporados; ${result.skipped} ya estaban integrados.`,
      });
      await fetchData();
    } catch (error) {
      console.error('Error migrating legacy canjes:', error);
      toast({ title: 'No se pudieron integrar los canjes anteriores', variant: 'destructive' });
    } finally {
      setMigrating(false);
    }
  };
  
  const filteredCanjes = useMemo(() => {
    if (!userInfo || !userInfo.id) return [];
    if (canManageAll) {
      return canjes;
    }
    // Asesores only see their clients' canjes
    const userClientIds = new Set(clients.filter(c => c.ownerId === userInfo.id).map(c => c.id));
    return canjes.filter(canje =>
      canje.asesorId === userInfo.id || userClientIds.has(canje.clienteId || '')
    );
  }, [canjes, clients, userInfo, canManageAll]);


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
      accessorKey: 'solicitanteCanje',
      header: 'Solicitado por',
      cell: ({ row }) => row.original.solicitanteCanje || '-',
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
      accessorKey: 'modalidad',
      header: 'Modalidad',
      cell: ({ row }) => (
        <Badge variant="outline">
          {row.original.modalidad === 'AVION' ? 'AVIÓN' : row.original.modalidad || 'Sin definir'}
        </Badge>
      ),
    },
    {
      accessorKey: 'valorCanje',
      header: () => <div className="text-right">Valor Canje</div>,
      cell: ({ row }) => <div className="text-right">${(row.original.valorCanje || 0).toLocaleString('es-AR')}</div>,
    },
    {
      id: 'saldo',
      header: () => <div className="text-right">Saldo</div>,
      cell: ({ row }) => {
        const canje = row.original;
        const totals = (canje.historialMensual || []).reduce((acc, cierre) => {
          const recibido = canje.modalidad === 'AVION'
            ? (cierre.recepciones || []).reduce((sum, item) => sum + Number(item.valorTotal || 0), 0)
            : (cierre.facturasCliente || []).reduce((sum, invoice) => sum + Number(invoice.monto || 0), 0);
          const compensado = canje.modalidad === 'AVION'
            ? (cierre.ordenesPublicidad || []).reduce((sum, order) => sum + Number(order.valorTotal || 0), 0)
            : (cierre.facturasAire || []).reduce((sum, invoice) => sum + Number(invoice.monto || 0), 0);
          return { recibido: acc.recibido + recibido, compensado: acc.compensado + compensado };
        }, { recibido: 0, compensado: 0 });
        const saldo = totals.recibido - totals.compensado;
        return <div className={cn("text-right font-medium", saldo === 0 ? "text-green-700" : "text-amber-700")}>${saldo.toLocaleString('es-AR')}</div>;
      },
    },
    {
      accessorKey: 'fechaCreacion',
      header: 'Fecha Creación',
      cell: ({ row }) => format(new Date(row.original.fechaCreacion), 'P', { locale: es }),
    },
    {
      id: 'actions',
      cell: ({ row }) => {
        const canje = row.original;
        const canEdit = canManageAll || userInfo?.id === canje.asesorId;
        if (!canEdit) return null;

        return (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" className="h-8 w-8 p-0">
                <span className="sr-only">Abrir menú</span>
                <MoreHorizontal className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={() => handleOpenForm(canje)}>
                Ver / Editar
              </DropdownMenuItem>
              {canManageAll && (
                <DropdownMenuItem
                  className="text-destructive"
                  onClick={(e) => { e.stopPropagation(); setCanjeToDelete(canje); }}
                >
                  <Trash2 className="mr-2 h-4 w-4" />
                  Eliminar
                </DropdownMenuItem>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        );
      },
    },
  ], [handleOpenForm, canManageAll, userInfo?.id]);

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
          {canManageAll && (
            <Button variant="outline" onClick={handleMigrateLegacy} disabled={migrating}>
              <RefreshCw className={cn("mr-2 h-4 w-4", migrating && "animate-spin")} />
              Integrar anteriores
            </Button>
          )}
          <Button onClick={() => handleOpenForm()}>
            <PlusCircle className="mr-2" />
            Nuevo Pedido de Canje
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
      <AlertDialog open={!!canjeToDelete} onOpenChange={(open) => !open && setCanjeToDelete(null)}>
        <AlertDialogContent>
            <AlertDialogHeader>
                <AlertDialogTitle>¿Estás seguro de eliminar este canje?</AlertDialogTitle>
                <AlertDialogDescription>
                    Esta acción es irreversible y eliminará permanentemente el canje titulado "{canjeToDelete?.titulo}".
                </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
                <AlertDialogCancel>Cancelar</AlertDialogCancel>
                <AlertDialogAction onClick={handleDeleteCanje} variant="destructive">
                    Eliminar
                </AlertDialogAction>
            </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
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
