'use client';

import React, { Suspense, useCallback, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { Header } from '@/components/layout/header';
import { Button } from '@/components/ui/button';
import { MoreHorizontal, PlusCircle, RefreshCw, Trash2 } from 'lucide-react';
import { useAuth } from '@/hooks/use-auth';
import { Spinner } from '@/components/ui/spinner';
import type { Canje, Client, User } from '@/lib/types';
import { createCanje, deleteCanje, getCanjes, updateCanje } from '@/lib/api/canjes';
import { getClients } from '@/lib/api/clients';
import { migrateLegacyConveniosToCanjes } from '@/lib/api/convenios';
import { getWorkflowAssignments } from '@/lib/api/system';
import { getAllUsers } from '@/lib/api/users';
import { useToast } from '@/hooks/use-toast';
import { sendEmail } from '@/lib/api/google-services';
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
    'Necesidad cargada': 'bg-blue-100 text-blue-800',
    'En evaluación': 'bg-sky-100 text-sky-800',
    'Pendiente gerencia': 'bg-amber-100 text-amber-800',
    'Aprobado gerencia': 'bg-green-100 text-green-800',
    'Rechazado gerencia': 'bg-red-100 text-red-800',
    'En gestión comercial': 'bg-cyan-100 text-cyan-800',
    'Compra directa': 'bg-indigo-100 text-indigo-800',
    'Resuelto': 'bg-emerald-100 text-emerald-800',
    Pedido: 'bg-blue-100 text-blue-800',
    'En gestión': 'bg-yellow-100 text-yellow-800',
    Culminado: 'bg-purple-100 text-purple-800',
    Aprobado: 'bg-green-100 text-green-800',
  };
  return <Badge variant="outline" className={cn(statusMap[status] || 'bg-slate-100 text-slate-800', 'capitalize')}>{status}</Badge>;
};

function CanjesPageComponent() {
  const { userInfo, loading: authLoading, isBoss, ensureGoogleAccessToken } = useAuth();
  const { toast } = useToast();
  const searchParams = useSearchParams();
  const needIdFromUrl = searchParams.get('id');

  const [needs, setNeeds] = useState<Canje[]>([]);
  const [clients, setClients] = useState<Client[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [selectedNeed, setSelectedNeed] = useState<Canje | null>(null);
  const [sorting, setSorting] = useState<SortingState>([]);
  const [needToDelete, setNeedToDelete] = useState<Canje | null>(null);
  const [migrating, setMigrating] = useState(false);
  const [needAccess, setNeedAccess] = useState({ canAccess: false, canCreate: false, canViewAll: false });

  const canManageAll = isBoss || userInfo?.role === 'Administracion' || userInfo?.role === 'Gerencia' || userInfo?.role === 'Admin';

  const handleOpenForm = useCallback((need: Canje | null = null) => {
    setSelectedNeed(need);
    setIsFormOpen(true);
  }, []);

  const fetchData = useCallback(async () => {
    if (!userInfo) return;
    setLoading(true);
    try {
      const assignments = await getWorkflowAssignments();
      const canCreate = assignments.needLoaders.includes(userInfo.id);
      const canViewAll = [
        ...assignments.needRequestReceivers,
        ...assignments.canjeRequestReceivers,
        ...assignments.canjeManagementApprovers,
        ...assignments.canjeCommercialReferents,
      ].includes(userInfo.id);
      const canAccess = canCreate || canViewAll;
      setNeedAccess({ canAccess, canCreate, canViewAll });
      if (!canAccess) return;

      const [fetchedNeeds, fetchedClients, fetchedUsers] = await Promise.all([getCanjes(), getClients(), getAllUsers()]);
      setNeeds(fetchedNeeds);
      setClients(fetchedClients as Client[]);
      setUsers(fetchedUsers);

      if (needIdFromUrl) {
        const needToOpen = fetchedNeeds.find(item => item.id === needIdFromUrl);
        if (needToOpen) handleOpenForm(needToOpen);
      }
    } catch (error) {
      console.error('Error fetching needs:', error);
      toast({ title: 'Error al cargar necesidades', variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  }, [toast, userInfo, needIdFromUrl, handleOpenForm]);

  useEffect(() => {
    if (!authLoading && userInfo) fetchData();
  }, [authLoading, userInfo, fetchData]);

  const notifyNeedReceivers = async (needId: string, needData: Omit<Canje, 'id' | 'fechaCreacion'>, accessToken: string) => {
    try {
      if (!userInfo) return false;

      const assignments = await getWorkflowAssignments();
      const recipients = assignments.needRequestReceivers
        .map(userId => users.find(user => user.id === userId)?.email)
        .filter((email): email is string => Boolean(email));
      if (recipients.length === 0) throw new Error('No hay usuarios asignados como receptores de necesidades.');

      const needUrl = `${window.location.origin}/canjes?id=${encodeURIComponent(needId)}`;
      await sendEmail({
        accessToken,
        to: Array.from(new Set(recipients)),
        subject: `Nueva necesidad de compra/contratación - ${needData.titulo}`,
        body: `
          <div style="font-family: Arial, sans-serif; color: #333; max-width: 640px; border: 1px solid #e2e8f0; padding: 20px; border-radius: 8px;">
            <h2 style="margin: 0 0 12px; color: #0f172a;">Nueva necesidad de compra / contratación</h2>
            <p><strong>${userInfo.name}</strong> cargó un nuevo pedido para evaluación.</p>
            <p><strong>Título:</strong> ${needData.titulo}<br/>
            <strong>Solicitante:</strong> ${needData.solicitanteCanje || '-'}<br/>
            <strong>Necesidad:</strong> ${needData.necesidadOrganizacion || '-'}</p>
            <p><strong>Detalle:</strong><br/>${(needData.pedido || '').replace(/\n/g, '<br/>')}</p>
            <p style="margin-top: 16px;"><a href="${needUrl}" style="display: inline-block; padding: 10px 16px; background: #1d4ed8; color: #fff; text-decoration: none; border-radius: 4px; font-weight: bold;">Ver necesidad</a></p>
          </div>
        `,
        fromName: userInfo.name,
        fromEmail: userInfo.email,
        replyTo: userInfo.email,
      });
      return true;
    } catch (error) {
      console.error('Error notifying need receivers:', error);
      throw error;
    }
  };

  const handleSaveNeed = async (needData: Omit<Canje, 'id' | 'fechaCreacion'>) => {
    if (!userInfo) return;
    try {
      if (selectedNeed) {
        await updateCanje(selectedNeed.id, needData);
        toast({ title: 'Necesidad actualizada' });
      } else {
        const accessToken = await ensureGoogleAccessToken();
        if (!accessToken) throw new Error('No se autorizó el envío de correo con Google.');
        const needId = await createCanje(needData);
        try {
          await notifyNeedReceivers(needId, needData, accessToken);
          toast({ title: 'Necesidad creada', description: 'La notificación fue enviada a los receptores asignados.' });
        } catch (notificationError) {
          toast({
            title: 'Necesidad creada, pero no notificada',
            description: notificationError instanceof Error ? notificationError.message : 'Revisá los responsables configurados y el acceso a Gmail.',
            variant: 'destructive',
          });
        }
      }
      fetchData();
    } catch (error) {
      console.error('Error saving need:', error);
      toast({ title: 'Error al guardar o notificar la necesidad', description: error instanceof Error ? error.message : undefined, variant: 'destructive' });
    }
  };

  const handleDeleteNeed = async () => {
    if (!needToDelete || !userInfo) return;
    try {
      await deleteCanje(needToDelete.id);
      toast({ title: 'Necesidad eliminada' });
      fetchData();
    } catch (error) {
      console.error('Error deleting need:', error);
      toast({ title: 'Error al eliminar', variant: 'destructive' });
    } finally {
      setNeedToDelete(null);
    }
  };

  const handleMigrateLegacy = async () => {
    if (!userInfo || !canManageAll) return;
    setMigrating(true);
    try {
      const result = await migrateLegacyConveniosToCanjes();
      toast({ title: 'Integración finalizada', description: `${result.created} canjes incorporados; ${result.skipped} ya estaban integrados.` });
      await fetchData();
    } catch (error) {
      console.error('Error migrating legacy canjes:', error);
      toast({ title: 'No se pudieron integrar los canjes anteriores', variant: 'destructive' });
    } finally {
      setMigrating(false);
    }
  };

  const filteredNeeds = useMemo(() => {
    if (!userInfo?.id) return [];
    if (canManageAll || needAccess.canViewAll) return needs;
    const userClientIds = new Set(clients.filter(client => client.ownerId === userInfo.id).map(client => client.id));
    return needs.filter(need => need.asesorId === userInfo.id || need.creadoPorId === userInfo.id || userClientIds.has(need.clienteId || ''));
  }, [needs, clients, userInfo, canManageAll, needAccess.canViewAll]);

  const columns = useMemo<ColumnDef<Canje>[]>(() => [
    { accessorKey: 'titulo', header: 'Necesidad', cell: ({ row }) => <div className="font-medium">{row.original.titulo}</div> },
    { accessorKey: 'solicitanteCanje', header: 'Solicitante', cell: ({ row }) => row.original.solicitanteCanje || '-' },
    { accessorKey: 'tipoResolucion', header: 'Resolución', cell: ({ row }) => <Badge variant="outline">{row.original.tipoResolucion || 'Pendiente'}</Badge> },
    { accessorKey: 'estado', header: 'Estado', cell: ({ row }) => getStatusPill(row.original.estado) },
    { accessorKey: 'clienteName', header: 'Cliente / proveedor', cell: ({ row }) => row.original.clienteName || '-' },
    { accessorKey: 'presupuestoValor', header: () => <div className="text-right">Presupuesto</div>, cell: ({ row }) => <div className="text-right">${Number(row.original.presupuestoValor || row.original.valorAcordado || 0).toLocaleString('es-AR')}</div> },
    { accessorKey: 'valorCanje', header: () => <div className="text-right">Valor OP</div>, cell: ({ row }) => <div className="text-right">${Number(row.original.valorCanje || 0).toLocaleString('es-AR')}</div> },
    { accessorKey: 'fechaResolucion', header: 'Fecha necesaria', cell: ({ row }) => row.original.fechaResolucion ? format(new Date(`${row.original.fechaResolucion}T12:00:00`), 'P', { locale: es }) : '-' },
    { accessorKey: 'fechaCreacion', header: 'Creación', cell: ({ row }) => format(new Date(row.original.fechaCreacion), 'P', { locale: es }) },
    {
      id: 'actions',
      cell: ({ row }) => {
        const need = row.original;
        const canEdit = canManageAll || userInfo?.id === need.asesorId || userInfo?.id === need.creadoPorId;
        if (!canEdit) return null;
        return (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" className="h-8 w-8 p-0"><span className="sr-only">Abrir menú</span><MoreHorizontal className="h-4 w-4" /></Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={() => handleOpenForm(need)}>Ver / Editar</DropdownMenuItem>
              {canManageAll && <DropdownMenuItem className="text-destructive" onClick={(event) => { event.stopPropagation(); setNeedToDelete(need); }}><Trash2 className="mr-2 h-4 w-4" />Eliminar</DropdownMenuItem>}
            </DropdownMenuContent>
          </DropdownMenu>
        );
      },
    },
  ], [handleOpenForm, canManageAll, userInfo?.id]);

  if (authLoading || loading) {
    return <div className="flex h-full w-full items-center justify-center"><Spinner size="large" /></div>;
  }

  if (!needAccess.canAccess) {
    return (
      <div className="flex h-full flex-col">
        <Header title="Necesidades" />
        <main className="flex flex-1 items-center justify-center p-6 text-center text-muted-foreground">
          No tenés un rol asignado para participar del circuito de Necesidades.
        </main>
      </div>
    );
  }

  return (
    <>
      <div className="flex flex-col h-full">
        <Header title="Necesidades">
          {canManageAll && (
            <Button variant="outline" onClick={handleMigrateLegacy} disabled={migrating}>
              <RefreshCw className={cn('mr-2 h-4 w-4', migrating && 'animate-spin')} />
              Integrar anteriores
            </Button>
          )}
          {needAccess.canCreate && (
            <Button onClick={() => handleOpenForm()}>
              <PlusCircle className="mr-2" />
              Nueva necesidad
            </Button>
          )}
        </Header>
        <main className="flex-1 overflow-auto p-4 md:p-6 lg:p-8">
          <ResizableDataTable
            columns={columns}
            data={filteredNeeds}
            sorting={sorting}
            setSorting={setSorting}
            onRowClick={need => handleOpenForm(need)}
            getRowId={row => row.id}
            enableRowResizing={false}
            emptyStateMessage="No se encontraron necesidades."
          />
        </main>
      </div>
      {isFormOpen && (
        <CanjeFormDialog
          isOpen={isFormOpen}
          onOpenChange={setIsFormOpen}
          onSave={handleSaveNeed}
          canje={selectedNeed}
          clients={clients}
          users={users}
          currentUser={userInfo!}
        />
      )}
      <AlertDialog open={!!needToDelete} onOpenChange={(open) => !open && setNeedToDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Eliminar esta necesidad?</AlertDialogTitle>
            <AlertDialogDescription>Esta acción eliminará permanentemente "{needToDelete?.titulo}".</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={handleDeleteNeed} variant="destructive">Eliminar</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

export default function CanjesPage() {
  return (
    <Suspense fallback={<div className="flex h-full w-full items-center justify-center"><Spinner size="large" /></div>}>
      <CanjesPageComponent />
    </Suspense>
  );
}
